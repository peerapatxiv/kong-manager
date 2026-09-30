import { describe, it, expect } from 'vitest'
import { composeBaseUrl, normalizeHostInput } from './connectionUrl'

describe('normalizeHostInput', () => {
  it('keeps the selected protocol when the host has no scheme', () => {
    expect(normalizeHostInput('https', ' localhost:8001 ')).toEqual({ protocol: 'https', host: 'localhost:8001' })
  })

  it('takes the protocol from a pasted full URL, case-insensitively', () => {
    expect(normalizeHostInput('http', 'https://kong.internal:8444')).toEqual({
      protocol: 'https',
      host: 'kong.internal:8444',
    })
    expect(normalizeHostInput('https', 'HTTP://kong.internal')).toEqual({ protocol: 'http', host: 'kong.internal' })
  })
})

describe('composeBaseUrl', () => {
  it('joins protocol and host', () => {
    expect(composeBaseUrl('http', '127.0.0.1:8001')).toBe('http://127.0.0.1:8001')
    expect(composeBaseUrl('https', 'kong.internal')).toBe('https://kong.internal')
  })

  it('lets a pasted URL override the selected protocol', () => {
    expect(composeBaseUrl('http', 'https://kong.internal:8444')).toBe('https://kong.internal:8444')
  })

  it('strips trailing slashes but keeps a path prefix', () => {
    expect(composeBaseUrl('http', 'kong.internal:8001///')).toBe('http://kong.internal:8001')
    expect(composeBaseUrl('http', 'gateway.internal/kong-admin/')).toBe('http://gateway.internal/kong-admin')
  })

  it.each(['', '   ', 'http://', 'https:///'])('returns null for the blank host %j', (host) => {
    expect(composeBaseUrl('http', host)).toBeNull()
  })
})
