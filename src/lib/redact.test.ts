// src/lib/redact.test.ts
import { describe, it, expect } from 'vitest'
import { redactSecrets } from './redact'

describe('redactSecrets', () => {
  it('replaces a top-level secret-named field with a mask, leaving other fields intact', () => {
    expect(redactSecrets({ username: 'alice', password: 'hunter2' })).toEqual({
      username: 'alice',
      password: '••••••••',
    })
  })

  it('recurses into nested objects, redacting secret keys wherever they appear', () => {
    const input = { custom_id: 'no-username-here', nested: { key: 'SUPER-SECRET-A', tags: ['x'] } }
    expect(redactSecrets(input)).toEqual({
      custom_id: 'no-username-here',
      nested: { key: '••••••••', tags: ['x'] },
    })
  })

  it('masks a credential-list container wholesale, since its name itself matches the secret-key heuristic', () => {
    // "keyauth_credentials" contains "key", so isSecretField already treats it as
    // secret at this level — consistent with the rest of the app's broad,
    // deliberately-inclusive substring heuristic (see secretFields.test.ts).
    const input = { keyauth_credentials: [{ key: 'SUPER-SECRET-A', tags: ['x'] }] }
    expect(redactSecrets(input)).toEqual({ keyauth_credentials: '••••••••' })
  })

  it('passes through primitives and null unchanged', () => {
    expect(redactSecrets('plain')).toBe('plain')
    expect(redactSecrets(42)).toBe(42)
    expect(redactSecrets(null)).toBeNull()
  })
})
