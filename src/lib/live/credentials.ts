import type { EntityResourceName } from '../kongAdmin/entities'

export type CredentialTypeId = 'key-auth' | 'basic-auth' | 'oauth2' | 'hmac-auth' | 'jwt' | 'acls'
export type CredentialFieldKind = 'text' | 'secret' | 'number' | 'boolean' | 'select' | 'list' | 'textarea'

export type CredentialField = {
  key: string
  label: string
  kind: CredentialFieldKind
  required?: boolean
  options?: readonly string[]
  default?: string | boolean
}

export type CredentialType = {
  id: CredentialTypeId
  label: string
  resource: EntityResourceName
  fields: CredentialField[]
  /** Field keys shown on each row of the credential list. */
  summaryKeys: string[]
}

export type CredentialForm = Record<string, string | number | boolean | string[]>

const TAGS: CredentialField = { key: 'tags', label: 'Tags', kind: 'list' }

// Fields follow Primate's user-auth-model. Anything Kong can generate (keys, client ids,
// secrets) is optional, so a blank field is omitted and Kong fills it in.
export const CREDENTIAL_TYPES: CredentialType[] = [
  {
    id: 'key-auth',
    label: 'Key auth',
    resource: 'key_auth',
    fields: [
      { key: 'key', label: 'Key', kind: 'secret' },
      { key: 'ttl', label: 'TTL (seconds)', kind: 'number' },
      TAGS,
    ],
    summaryKeys: ['key'],
  },
  {
    id: 'basic-auth',
    label: 'Basic auth',
    resource: 'basic_auth',
    fields: [
      { key: 'username', label: 'Username', kind: 'text', required: true },
      { key: 'password', label: 'Password', kind: 'secret', required: true },
      TAGS,
    ],
    summaryKeys: ['username'],
  },
  {
    id: 'oauth2',
    label: 'OAuth 2.0',
    resource: 'oauth2_credentials',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'client_id', label: 'Client ID', kind: 'text' },
      { key: 'client_secret', label: 'Client secret', kind: 'secret' },
      { key: 'client_type', label: 'Client type', kind: 'select', options: ['confidential', 'public'] },
      { key: 'hash_secret', label: 'Hash secret', kind: 'boolean' },
      { key: 'redirect_uris', label: 'Redirect URIs', kind: 'list' },
      TAGS,
    ],
    summaryKeys: ['name', 'client_id'],
  },
  {
    id: 'hmac-auth',
    label: 'HMAC auth',
    resource: 'hmac_auth',
    fields: [
      { key: 'username', label: 'Username', kind: 'text', required: true },
      { key: 'secret', label: 'Secret', kind: 'secret' },
      TAGS,
    ],
    summaryKeys: ['username'],
  },
  {
    id: 'jwt',
    label: 'JWT',
    resource: 'jwt_credentials',
    fields: [
      {
        key: 'algorithm',
        label: 'Algorithm',
        kind: 'select',
        options: ['HS256', 'HS384', 'HS512', 'RS256', 'ES256'],
        default: 'HS256',
      },
      { key: 'key', label: 'Key', kind: 'text' },
      { key: 'secret', label: 'Secret', kind: 'secret' },
      { key: 'rsa_public_key', label: 'RSA public key', kind: 'textarea' },
      TAGS,
    ],
    summaryKeys: ['key', 'algorithm'],
  },
  {
    id: 'acls',
    label: 'ACL groups',
    resource: 'acls',
    fields: [{ key: 'group', label: 'Group', kind: 'text', required: true }, TAGS],
    summaryKeys: ['group'],
  },
]

export function credentialType(id: CredentialTypeId): CredentialType {
  const found = CREDENTIAL_TYPES.find((type) => type.id === id)
  if (!found) throw new Error(`Unknown credential type "${id}"`)
  return found
}

export function newCredentialForm(type: CredentialType): CredentialForm {
  const form: CredentialForm = {}
  for (const field of type.fields) {
    if (field.default !== undefined) form[field.key] = field.default
    else if (field.kind === 'boolean') form[field.key] = false
    else if (field.kind === 'list') form[field.key] = []
    else form[field.key] = ''
  }
  return form
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

export function validateCredential(type: CredentialType, form: CredentialForm): string[] {
  return type.fields
    .filter((field) => field.required && asText(form[field.key]).trim() === '')
    .map((field) => `${field.label} is required.`)
}

export function toCredentialPayload(type: CredentialType, form: CredentialForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of type.fields) {
    const value = form[field.key]
    switch (field.kind) {
      case 'secret':
        // Exact as typed: a password may legitimately start or end with a space.
        if (asText(value).trim() !== '') payload[field.key] = value
        break
      case 'text':
      case 'select':
      case 'textarea':
        if (asText(value).trim() !== '') payload[field.key] = asText(value).trim()
        break
      case 'number':
        if (typeof value === 'number') payload[field.key] = value
        break
      case 'boolean':
        if (value === true) payload[field.key] = true
        break
      case 'list': {
        const items = Array.isArray(value) ? value.map((item) => item.trim()).filter(Boolean) : []
        if (items.length > 0) payload[field.key] = items
        break
      }
    }
  }
  return payload
}
