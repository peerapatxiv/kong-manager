import { isSecretField } from './secretFields'

const MASK = '••••••••'

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item))
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSecretField(key) ? MASK : redactSecrets(v)
    }
    return result
  }
  return value
}
