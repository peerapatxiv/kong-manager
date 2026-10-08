import { describe, it, expect } from 'vitest'
import { countTargetsByUpstream, newTargetForm, targetsByAddress, toTargetPayload, validateTarget } from './targetForm'

const form = (target: string, weight: number | '' = 100) => ({ target, weight, tags: [] as string[] })

describe('validateTarget', () => {
  it.each(['api.internal', 'api.internal:8080', '10.0.0.1:80', '[::1]:8080', 'a'])('accepts %s', (target) => {
    expect(validateTarget(form(target))).toEqual([])
  })

  it.each(['', '  ', 'a b', 'host:0', 'host:70000', '::1', 'host:', ':80'])('rejects %j', (target) => {
    expect(validateTarget(form(target))).toEqual(['Please provide a target as host, host:port or [ipv6]:port.'])
  })

  it.each([-1, 1.5, 65536])('rejects weight %s', (weight) => {
    expect(validateTarget(form('a:80', weight))).toEqual(['Weight must be a whole number from 0 to 65535.'])
  })

  it('accepts weight 0, 65535 and an empty weight (Kong defaults it)', () => {
    for (const weight of [0, 65535, ''] as const) expect(validateTarget(form('a:80', weight))).toEqual([])
  })
})

describe('toTargetPayload', () => {
  it('trims the target and omits an empty weight', () => {
    expect(toTargetPayload({ target: ' a:80 ', weight: '', tags: [' x ', ''] })).toEqual({ target: 'a:80', tags: ['x'] })
    expect(toTargetPayload(newTargetForm())).toEqual({ target: '', weight: 100, tags: [] })
  })
})

describe('targetsByAddress', () => {
  it('keeps the newest row per address and hides removed (weight 0) ones, sorted by address', () => {
    const rows = [
      { id: '1', target: 'b:80', weight: 100, created_at: 1 },
      { id: '2', target: 'a:80', weight: 100, created_at: 1 },
      { id: '3', target: 'a:80', weight: 50, created_at: 2 },
      { id: '4', target: 'c:80', weight: 100, created_at: 1 },
      { id: '5', target: 'c:80', weight: 0, created_at: 2 },
    ]
    expect(targetsByAddress(rows).map((row) => [row.id, row.weight])).toEqual([['3', 50], ['1', 100]])
  })

  it('lets the later row win a created_at tie and ignores rows without an address', () => {
    const rows = [{ id: '1', target: 'a:80', created_at: 1, weight: 1 }, { id: '2', target: 'a:80', created_at: 1, weight: 2 }, { id: '3' }]
    expect(targetsByAddress(rows).map((row) => row.id)).toEqual(['2'])
  })
})

describe('countTargetsByUpstream', () => {
  it('counts the current targets of each upstream', () => {
    const rows = [
      { target: 'a:80', weight: 100, created_at: 1, upstream: { id: 'u1' } },
      { target: 'a:80', weight: 50, created_at: 2, upstream: { id: 'u1' } },
      { target: 'b:80', weight: 100, created_at: 1, upstream: { id: 'u1' } },
      { target: 'a:80', weight: 100, created_at: 1, upstream: { id: 'u2' } },
      { target: 'z:80', weight: 100, created_at: 1 },
    ]
    expect(countTargetsByUpstream(rows)).toEqual({ u1: 2, u2: 1 })
  })
})
