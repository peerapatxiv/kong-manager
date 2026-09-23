export type ValueType =
  | 'string'
  | 'multiline-string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'string-array'
  | 'object-array'
  | 'object'

const SCRIPTY_KEY_PATTERN = /^(access|header_filter|body_filter|rewrite|log)$/i
const LUA_LOOKING_PATTERN = /\bngx\.|\bkong\.|\bfunction\s*\(|\blocal\s+\S+\s*=/

export function isMultilineString(key: string, value: string): boolean {
  if (value.includes('\n')) return true
  if (SCRIPTY_KEY_PATTERN.test(key)) return true
  return LUA_LOOKING_PATTERN.test(value)
}

export function inferValueType(key: string, value: unknown): ValueType {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') {
    return isMultilineString(key, value) ? 'multiline-string' : 'string'
  }
  if (Array.isArray(value)) {
    const firstObject = value.find((item) => typeof item === 'object' && item !== null)
    return firstObject !== undefined ? 'object-array' : 'string-array'
  }
  if (typeof value === 'object') return 'object'
  return 'string'
}
