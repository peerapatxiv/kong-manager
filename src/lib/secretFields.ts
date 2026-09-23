const SECRET_KEY_PATTERN = /(password|secret|token|key)/i
const CREDENTIAL_LIST_PATTERN = /_credentials$/i

export function isSecretField(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key)
}

export function isCredentialListKey(key: string): boolean {
  return CREDENTIAL_LIST_PATTERN.test(key)
}
