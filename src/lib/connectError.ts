import { KongAdminApiError } from './kongAdmin/http'

/** A connect failure in plain words, with the most likely cause and what to check. */
export function describeConnectError(err: unknown, baseUrl: string): string {
  if (err instanceof KongAdminApiError) {
    if (err.kind === 'network') {
      return (
        `Could not reach ${baseUrl}. Check the address, that Kong's Admin API is running, and that it allows ` +
        `requests from this site (CORS). A page served over https cannot call a plain http address, except localhost. ` +
        `(${err.message})`
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
