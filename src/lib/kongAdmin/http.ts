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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function buildHeaders(auth?: KongAdminAuth): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth?.token) headers['Kong-Admin-Token'] = auth.token
  if (auth?.username) headers['Authorization'] = `Basic ${btoa(`${auth.username}:${auth.password ?? ''}`)}`
  return headers
}

function buildUrl(baseUrl: string, path: string, query?: AdminFetchOptions['query']): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) params.append(key, String(value))
  }
  const queryString = params.toString()
  return `${normalizeBaseUrl(baseUrl)}${path}${queryString ? `?${queryString}` : ''}`
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
  let response: Response
  try {
    response = await fetch(buildUrl(conn.baseUrl, path, options.query), {
      method,
      headers: buildHeaders(conn.auth),
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
