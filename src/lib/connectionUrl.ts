export type ConnectionProtocol = 'http' | 'https'

/** Splits a pasted full URL into protocol and host; otherwise keeps the selected protocol. */
export function normalizeHostInput(
  protocol: ConnectionProtocol,
  input: string,
): { protocol: ConnectionProtocol; host: string } {
  const trimmed = input.trim()
  const scheme = /^(https?):\/\/(.*)$/i.exec(trimmed)
  if (scheme) return { protocol: scheme[1].toLowerCase() as ConnectionProtocol, host: scheme[2] }
  return { protocol, host: trimmed }
}

/** The Admin API base URL for a protocol and host, or null when the host is blank. */
export function composeBaseUrl(protocol: ConnectionProtocol, input: string): string | null {
  const normalized = normalizeHostInput(protocol, input)
  const host = normalized.host.replace(/\/+$/, '')
  return host ? `${normalized.protocol}://${host}` : null
}
