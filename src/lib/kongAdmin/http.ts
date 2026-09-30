export type KongAdminAuth = {
  token?: string
  username?: string
  password?: string
}

export type KongAdminConnection = {
  baseUrl: string
  auth?: KongAdminAuth
}

export type KongAdminApiErrorKind = 'network' | 'auth' | 'notFound' | 'conflict' | 'validation' | 'server'

export class KongAdminApiError extends Error {
  status: number
  kind: KongAdminApiErrorKind
  kongMessage?: string
  fields?: Record<string, unknown>

  constructor(
    message: string,
    init: {
      status?: number
      kind?: KongAdminApiErrorKind
      kongMessage?: string
      fields?: Record<string, unknown>
    } = {},
  ) {
    super(message)
    this.name = 'KongAdminApiError'
    this.status = init.status ?? 0
    this.kind = init.kind ?? 'network'
    this.kongMessage = init.kongMessage
    this.fields = init.fields
  }
}

export type AdminFetchOptions = {
  query?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
}

const TIMEOUT_MS = 20000
const PROXY_PATH = '/__kong'

/** True under `npm run dev:proxy`, where the dev server forwards Kong calls so CORS never applies. */
export function isProxyMode(): boolean {
  return import.meta.env.VITE_KONG_PROXY === 'true'
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

// Content-Type is sent only with a body. Without it, a read with no credentials is a
// "simple" cross-origin request, so the browser skips the CORS preflight.
function buildHeaders(auth: KongAdminAuth | undefined, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = hasBody ? { 'Content-Type': 'application/json' } : {}
  if (auth?.token) headers['Kong-Admin-Token'] = auth.token
  if (auth?.username) headers['Authorization'] = `Basic ${btoa(`${auth.username}:${auth.password ?? ''}`)}`
  return headers
}

function buildRequestTarget(
  baseUrl: string,
  path: string,
  query?: AdminFetchOptions['query'],
): { url: string; proxyHeaders: Record<string, string> } {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) params.append(key, String(value))
  }
  const queryString = params.toString()
  const tail = `${path}${queryString ? `?${queryString}` : ''}`
  const base = normalizeBaseUrl(baseUrl)
  // In proxy mode the browser calls its own dev server (same origin), which calls Kong.
  if (isProxyMode()) return { url: `${PROXY_PATH}${tail}`, proxyHeaders: { 'X-Kong-Target': base } }
  return { url: `${base}${tail}`, proxyHeaders: {} }
}

function kindForStatus(status: number): KongAdminApiErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'notFound'
  if (status === 409) return 'conflict'
  if (status >= 500) return 'server'
  return 'validation'
}

async function toApiError(response: Response): Promise<KongAdminApiError> {
  const text = await response.text()
  // The local proxy marks its own failures (Kong unreachable, bad target) so they are not
  // mistaken for an HTTP error from Kong itself.
  if (response.headers?.get('x-kong-proxy-error')) {
    let message = text
    try {
      const parsed = JSON.parse(text) as { message?: unknown }
      if (typeof parsed.message === 'string') message = parsed.message
    } catch {
      // Keep the raw text.
    }
    return new KongAdminApiError(message, { status: 0, kind: 'network' })
  }
  let kongMessage: string | undefined
  let fields: Record<string, unknown> | undefined
  try {
    const parsed = JSON.parse(text) as { message?: unknown; fields?: unknown }
    if (typeof parsed.message === 'string') kongMessage = parsed.message
    if (parsed.fields && typeof parsed.fields === 'object') fields = parsed.fields as Record<string, unknown>
  } catch {
    // Not JSON (for example an HTML error page from a proxy); keep only the raw text.
  }
  return new KongAdminApiError(`Kong Admin API responded ${response.status}: ${text}`, {
    status: response.status,
    kind: kindForStatus(response.status),
    kongMessage,
    fields,
  })
}

export async function adminFetch(
  conn: KongAdminConnection,
  method: string,
  path: string,
  options: AdminFetchOptions = {},
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const { url, proxyHeaders } = buildRequestTarget(conn.baseUrl, path, options.query)
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: { ...buildHeaders(conn.auth, options.body !== undefined), ...proxyHeaders },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    })
  } catch (err) {
    const message = controller.signal.aborted
      ? `Request timed out after ${TIMEOUT_MS / 1000}s`
      : err instanceof Error
        ? err.message
        : String(err)
    throw new KongAdminApiError(message, { status: 0, kind: 'network' })
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) throw await toApiError(response)
  return response
}

export async function adminJson<T>(
  conn: KongAdminConnection,
  method: string,
  path: string,
  options?: AdminFetchOptions,
): Promise<T> {
  const response = await adminFetch(conn, method, path, options)
  return (await response.json()) as T
}
