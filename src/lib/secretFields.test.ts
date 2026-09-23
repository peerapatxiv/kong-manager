// src/lib/secretFields.test.ts
import { describe, it, expect } from 'vitest'
import { isSecretField, isCredentialListKey } from './secretFields'

describe('isSecretField', () => {
  it('matches password/key/secret/token substrings, case-insensitively', () => {
    expect(isSecretField('password')).toBe(true)
    expect(isSecretField('key')).toBe(true)
    expect(isSecretField('api_key')).toBe(true)
    expect(isSecretField('Client_Secret')).toBe(true)
    expect(isSecretField('access_token')).toBe(true)
  })

  it('does not match unrelated field names', () => {
    expect(isSecretField('username')).toBe(false)
    expect(isSecretField('host')).toBe(false)
    expect(isSecretField('protocols')).toBe(false)
    expect(isSecretField('enabled')).toBe(false)
  })
})

describe('isCredentialListKey', () => {
  it('matches Kong credential list keys', () => {
    expect(isCredentialListKey('keyauth_credentials')).toBe(true)
    expect(isCredentialListKey('basicauth_credentials')).toBe(true)
  })

  it('does not match plain list keys', () => {
    expect(isCredentialListKey('routes')).toBe(false)
    expect(isCredentialListKey('tags')).toBe(false)
  })
})
