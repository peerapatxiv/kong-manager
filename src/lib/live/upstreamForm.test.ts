import { describe, it, expect } from 'vitest'
import { fromEntity, hashOptions, newUpstreamForm, toPayload, validateUpstream } from './upstreamForm'

const base = () => ({ ...newUpstreamForm(), name: 'billing' })

describe('newUpstreamForm', () => {
  it('starts from the defaults, without healthchecks', () => {
    expect(newUpstreamForm()).toEqual({
      name: '',
      algorithm: 'round-robin',
      hash_on: 'none',
      hash_fallback: 'none',
      slots: 10000,
      host_header: '',
      tags: [],
    })
  })
})

describe('fromEntity', () => {
  it('maps an upstream and ignores healthchecks and unknown fields', () => {
    const form = fromEntity({ id: 'u1', name: 'api', algorithm: 'latency', hash_on: 'ip', slots: 1000, host_header: 'h', tags: ['a', 3], healthchecks: { x: 1 } })
    expect(form).toEqual({ name: 'api', algorithm: 'latency', hash_on: 'ip', hash_fallback: 'none', slots: 1000, host_header: 'h', tags: ['a'] })
  })
})

describe('hashOptions', () => {
  it('offers the options that need no extra field', () => {
    expect(hashOptions('none')).toEqual(['none', 'consumer', 'ip'])
  })

  it('keeps a value the form does not offer, so editing never rewrites it', () => {
    expect(hashOptions('header')).toEqual(['none', 'consumer', 'ip', 'header'])
  })
})

describe('validateUpstream', () => {
  it('requires a name', () => {
    expect(validateUpstream({ ...base(), name: '  ' })).toEqual(['Please provide a name for the upstream.'])
  })

  it.each([9, 65537, 1.5])('rejects slots %s', (slots) => {
    expect(validateUpstream({ ...base(), slots })).toEqual(['Slots must be a whole number from 10 to 65536.'])
  })

  it('accepts a valid form and an empty slots field', () => {
    expect(validateUpstream(base())).toEqual([])
    expect(validateUpstream({ ...base(), slots: '' })).toEqual([])
  })
})

describe('toPayload', () => {
  it('trims, cleans tags and leaves out an empty host_header on create', () => {
    const payload = toPayload({ ...base(), name: ' billing ', tags: [' a ', ''], host_header: '' }, 'create')
    expect(payload).toEqual({ name: 'billing', algorithm: 'round-robin', hash_on: 'none', hash_fallback: 'none', slots: 10000, tags: ['a'] })
    expect(payload).not.toHaveProperty('healthchecks')
  })

  it('sends host_header null on update when it was cleared, so Kong unsets it', () => {
    expect(toPayload({ ...base(), host_header: '' }, 'update')).toMatchObject({ host_header: null })
  })

  it('omits slots when the field is empty', () => {
    expect(toPayload({ ...base(), slots: '' }, 'create')).not.toHaveProperty('slots')
  })
})
