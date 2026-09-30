import { describe, it, expect } from 'vitest'
import { ENTITY_RESOURCES } from '../kongAdmin/entities'
import {
  CREDENTIAL_TYPES,
  credentialType,
  newCredentialForm,
  toCredentialPayload,
  validateCredential,
} from './credentials'

const type = (id: Parameters<typeof credentialType>[0]) => credentialType(id)

describe('CREDENTIAL_TYPES', () => {
  it('has the six Primate types, each mapped to a nested registry resource', () => {
    expect(CREDENTIAL_TYPES.map((t) => t.id)).toEqual(['key-auth', 'basic-auth', 'oauth2', 'hmac-auth', 'jwt', 'acls'])
    for (const t of CREDENTIAL_TYPES) {
      expect(ENTITY_RESOURCES[t.resource].nested).toBe(true)
      expect(ENTITY_RESOURCES[t.resource].path).toContain('consumers/:parentId/')
      expect(t.fields.some((f) => f.key === 'tags' && f.kind === 'list')).toBe(true)
      for (const key of t.summaryKeys) expect(t.fields.some((f) => f.key === key)).toBe(true)
    }
  })

  it('marks the secret fields', () => {
    const secrets = (id: Parameters<typeof credentialType>[0]) =>
      type(id).fields.filter((f) => f.kind === 'secret').map((f) => f.key)
    expect(secrets('key-auth')).toEqual(['key'])
    expect(secrets('basic-auth')).toEqual(['password'])
    expect(secrets('oauth2')).toEqual(['client_secret'])
    expect(secrets('hmac-auth')).toEqual(['secret'])
    expect(secrets('jwt')).toEqual(['secret'])
    expect(secrets('acls')).toEqual([])
  })
})

describe('newCredentialForm', () => {
  it('starts every field at its default: empty text, false booleans, empty lists, jwt HS256', () => {
    expect(newCredentialForm(type('key-auth'))).toEqual({ key: '', ttl: '', tags: [] })
    expect(newCredentialForm(type('oauth2'))).toMatchObject({ name: '', hash_secret: false, redirect_uris: [], client_type: '' })
    expect(newCredentialForm(type('jwt'))).toMatchObject({ algorithm: 'HS256', key: '', secret: '', rsa_public_key: '' })
  })
})

describe('validateCredential', () => {
  it('reports one message per blank required field', () => {
    expect(validateCredential(type('basic-auth'), newCredentialForm(type('basic-auth')))).toEqual([
      'Username is required.',
      'Password is required.',
    ])
    expect(validateCredential(type('acls'), newCredentialForm(type('acls')))).toEqual(['Group is required.'])
  })

  it('treats a whitespace-only required text field as blank', () => {
    const form = { ...newCredentialForm(type('hmac-auth')), username: '   ' }
    expect(validateCredential(type('hmac-auth'), form)).toEqual(['Username is required.'])
  })

  it('accepts filled required fields, and types with no required field', () => {
    expect(validateCredential(type('basic-auth'), { ...newCredentialForm(type('basic-auth')), username: 'u', password: 'p' })).toEqual([])
    expect(validateCredential(type('key-auth'), newCredentialForm(type('key-auth')))).toEqual([])
    expect(validateCredential(type('jwt'), newCredentialForm(type('jwt')))).toEqual([])
  })
})

describe('toCredentialPayload', () => {
  it('omits blank fields so Kong can generate them', () => {
    expect(toCredentialPayload(type('key-auth'), newCredentialForm(type('key-auth')))).toEqual({})
  })

  it('sends a number only when set, including zero', () => {
    expect(toCredentialPayload(type('key-auth'), { ...newCredentialForm(type('key-auth')), ttl: 3600 })).toEqual({ ttl: 3600 })
    expect(toCredentialPayload(type('key-auth'), { ...newCredentialForm(type('key-auth')), ttl: 0 })).toEqual({ ttl: 0 })
  })

  it('trims text but sends a secret exactly as typed', () => {
    const payload = toCredentialPayload(type('basic-auth'), {
      ...newCredentialForm(type('basic-auth')),
      username: '  alice ',
      password: '  pass word  ',
    })
    expect(payload).toEqual({ username: 'alice', password: '  pass word  ' })
  })

  it('omits a secret that is only whitespace', () => {
    expect(toCredentialPayload(type('key-auth'), { ...newCredentialForm(type('key-auth')), key: '   ' })).toEqual({})
  })

  it('sends a boolean only when true, and lists only when non-empty and cleaned', () => {
    const base = { ...newCredentialForm(type('oauth2')), name: ' app ' }
    expect(toCredentialPayload(type('oauth2'), base)).toEqual({ name: 'app' })
    expect(
      toCredentialPayload(type('oauth2'), {
        ...base,
        hash_secret: true,
        redirect_uris: [' https://a.example/cb ', ''],
        tags: [' t '],
        client_type: 'confidential',
      }),
    ).toEqual({
      name: 'app',
      hash_secret: true,
      redirect_uris: ['https://a.example/cb'],
      tags: ['t'],
      client_type: 'confidential',
    })
  })

  it('keeps the jwt algorithm and trims a multi-line public key', () => {
    const payload = toCredentialPayload(type('jwt'), {
      ...newCredentialForm(type('jwt')),
      algorithm: 'RS256',
      rsa_public_key: '\n-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----\n',
    })
    expect(payload).toEqual({
      algorithm: 'RS256',
      rsa_public_key: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
    })
  })

  it('never sends null or undefined', () => {
    for (const t of CREDENTIAL_TYPES) {
      const payload = toCredentialPayload(t, newCredentialForm(t))
      expect(Object.values(payload).some((v) => v === null || v === undefined)).toBe(false)
    }
  })
})
