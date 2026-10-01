import { isProxyMode, KongAdminApiError } from './kongAdmin/http'

const LOCAL_APP_URL = 'http://localhost:4173/kong-manager/'

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/** Browsers refuse a plain http call from an https page, except to the local machine. */
function mixedContentNote(baseUrl: string): string {
  if (typeof window === 'undefined' || window.location.protocol !== 'https:') return ''
  try {
    const url = new URL(baseUrl)
    if (url.protocol === 'http:' && !LOCAL_HOSTS.includes(url.hostname)) {
      return 'This page is served over https, so it cannot call a plain http address. '
    }
  } catch {
    // An address that does not parse has no mixed-content problem to point out.
  }
  return ''
}

/** A connect failure in plain words, with the most likely cause and what to check. */
export function describeConnectError(err: unknown, baseUrl: string): string {
  if (err instanceof KongAdminApiError) {
    if (err.kind === 'network') {
      if (isProxyMode()) {
        return `Could not reach ${baseUrl} through the local proxy. Check the address and that Kong's Admin API is running. (${err.message})`
      }
      return (
        `Could not reach ${baseUrl} from this page. Check the address and that Kong's Admin API is running. ` +
        `A website can only call a Kong Admin API that allows it (CORS), and when the API needs a login the ` +
        `browser first sends a preflight request without credentials, which Kong must answer too. ` +
        mixedContentNote(baseUrl) +
        `To connect without changing Kong, run the app locally with "npm start" and open ` +
        `${LOCAL_APP_URL}, which forwards the requests for you. (${err.message})`
      )
    }
    if (err.kind === 'auth') {
      return `Kong rejected the credentials (HTTP ${err.status}). Check the username and password, or the admin token.`
    }
    if (err.kind === 'notFound') {
      return (
        `Kong answered ${err.status} for /config. That endpoint only exists when Kong runs without a database ` +
        `(DB-less). For a database-backed Kong, use the Live section instead.`
      )
    }
    return err.message
  }
  return err instanceof Error ? err.message : String(err)
}
