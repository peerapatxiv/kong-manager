import http from 'node:http'
import https from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Requests to `${PROXY_PREFIX}/<admin api path>` are forwarded to the Kong named in X-Kong-Target. */
export const PROXY_PREFIX = '/__kong'
export const TARGET_HEADER = 'x-kong-target'
/** Set on responses that come from the proxy itself, so the app can tell them apart from Kong's own. */
export const PROXY_ERROR_HEADER = 'x-kong-proxy-error'

const TIMEOUT_MS = 30000

// Hop-by-hop headers must not be forwarded, and the browser's Origin/Referer describe the
// dev page, not this server-to-server call.
const DROPPED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'origin',
  'referer',
  TARGET_HEADER,
])

function fail(res: ServerResponse, status: number, message: string) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader(PROXY_ERROR_HEADER, '1')
  res.end(JSON.stringify({ message }))
}

function parseTarget(header: string | string[] | undefined): URL | null {
  const value = Array.isArray(header) ? header[0] : header
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/**
 * A Connect-style middleware for the Vite dev server. The browser calls this server, which
 * is same-origin, and this server calls Kong, where CORS does not apply. It forwards to
 * whatever http(s) address it is given, so only enable it on your own machine.
 */
export function kongProxyMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const url = req.url ?? ''
  if (url !== PROXY_PREFIX && !url.startsWith(`${PROXY_PREFIX}/`) && !url.startsWith(`${PROXY_PREFIX}?`)) {
    next()
    return
  }

  const target = parseTarget(req.headers[TARGET_HEADER])
  if (!target) {
    fail(res, 400, 'Missing or invalid X-Kong-Target header: it must be an http:// or https:// address.')
    return
  }

  const headers: http.OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined && !DROPPED_REQUEST_HEADERS.has(name)) headers[name] = value
  }

  const client = target.protocol === 'https:' ? https : http
  const upstream = client.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      method: req.method,
      path: `${target.pathname.replace(/\/+$/, '')}${url.slice(PROXY_PREFIX.length)}`,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )

  upstream.setTimeout(TIMEOUT_MS, () => upstream.destroy(new Error(`timed out after ${TIMEOUT_MS / 1000}s`)))
  upstream.on('error', (err) => {
    if (res.headersSent) res.destroy()
    else fail(res, 502, `Could not reach Kong at ${target.origin}: ${err.message}`)
  })
  req.pipe(upstream)
}
