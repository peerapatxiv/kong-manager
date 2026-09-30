import { describe, it, expect } from 'vitest'
import { fromEntity, newConsumerForm, toPayload, validateConsumer } from './consumerForm'

const MESSAGE = 'Please provide either a username or a custom ID.'

describe('newConsumerForm', () => {
  it('starts empty', () => {
    expect(newConsumerForm()).toEqual({ username: '', custom_id: '', tags: [] })
  })
})

describe('validateConsumer', () => {
  it.each([
    ['both empty', { username: '', custom_id: '' }],
    ['both whitespace-only', { username: '   ', custom_id: ' \t ' }],
  ])('rejects %s with the Primate message', (_label, patch) => {
    expect(validateConsumer({ ...newConsumerForm(), ...patch })).toEqual([MESSAGE])
  })

  it.each([
    ['only a username', { username: 'alice', custom_id: '' }],
    ['only a custom ID', { username: '', custom_id: 'ext-1' }],
    ['both', { username: 'alice', custom_id: 'ext-1' }],
  ])('accepts %s', (_label, patch) => {
    expect(validateConsumer({ ...newConsumerForm(), ...patch })).toEqual([])
  })
})

describe('toPayload', () => {
  it('trims strings and cleans tags', () => {
    expect(toPayload({ username: '  alice ', custom_id: ' ext-1 ', tags: [' a ', '', '  '] }, 'update')).toEqual({
      username: 'alice',
      custom_id: 'ext-1',
      tags: ['a'],
    })
  })

  it('on update, sends null for a cleared username or custom ID so the server clears it', () => {
    expect(toPayload({ username: '   ', custom_id: 'ext-1', tags: [] }, 'update')).toMatchObject({
      username: null,
      custom_id: 'ext-1',
    })
    expect(toPayload({ username: 'alice', custom_id: '', tags: [] }, 'update')).toMatchObject({
      username: 'alice',
      custom_id: null,
    })
  })

  it('on create, never sends null values', () => {
    const payload = toPayload({ username: 'alice', custom_id: '', tags: [] }, 'create')

    expect(payload).toEqual({ username: 'alice', tags: [] })
    expect(Object.values(payload).some((v) => v === null || v === undefined)).toBe(false)
  })
})

describe('fromEntity', () => {
  it('maps a Kong consumer into the form', () => {
    expect(fromEntity({ id: 'c1', username: 'alice', custom_id: 'ext-1', tags: ['t'] })).toEqual({
      username: 'alice',
      custom_id: 'ext-1',
      tags: ['t'],
    })
  })

  it('tolerates null and missing fields, and round-trips back to the same payload', () => {
    expect(fromEntity({ username: null, custom_id: null, tags: null })).toEqual({ username: '', custom_id: '', tags: [] })
    expect(toPayload(fromEntity({ username: 'alice', custom_id: null, tags: ['t'] }), 'update')).toEqual({
      username: 'alice',
      custom_id: null,
      tags: ['t'],
    })
  })
})
