// src/lib/diff.test.ts
import { describe, it, expect } from 'vitest'
import { diffLeaves, diffEntities, diffKongConfigs } from './diff'
import type { KongConfig, KongService } from '../types/kong'

describe('diffLeaves', () => {
  it('returns no changes for deeply equal values', () => {
    expect(diffLeaves({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toEqual([])
  })

  it('reports changed leaf fields with dotted/bracketed paths', () => {
    const before = { config: { minute: 100, nested: { x: 1 } } }
    const after = { config: { minute: 200, nested: { x: 2 } } }
    const changes = diffLeaves(before, after)
    expect(changes).toEqual(
      expect.arrayContaining([
        { path: 'config.minute', before: 100, after: 200 },
        { path: 'config.nested.x', before: 1, after: 2 },
      ]),
    )
  })

  it('treats different-length arrays as a single leaf change', () => {
    const changes = diffLeaves({ tags: ['a'] }, { tags: ['a', 'b'] })
    expect(changes).toEqual([{ path: 'tags', before: ['a'], after: ['a', 'b'] }])
  })
})

describe('diffEntities', () => {
  it('finds added, removed, and changed entities by natural key', () => {
    const a = [
      { name: 'svc-a', host: 'a.internal' },
      { name: 'svc-b', host: 'b.internal' },
    ]
    const b = [
      { name: 'svc-a', host: 'a.internal.new' },
      { name: 'svc-c', host: 'c.internal' },
    ]
    const result = diffEntities(a, b, 'name')

    expect(result.added).toEqual([{ name: 'svc-c', host: 'c.internal' }])
    expect(result.removed).toEqual([{ name: 'svc-b', host: 'b.internal' }])
    expect(result.changed).toHaveLength(1)
    expect(result.changed[0].key).toBe('svc-a')
    expect(result.changed[0].changes).toEqual([
      { path: 'host', before: 'a.internal', after: 'a.internal.new' },
    ])
  })

  it('buckets entities with no usable natural key as unmatched instead of pairing them', () => {
    const a = [{ host: 'no-name-a' }]
    const b = [{ host: 'no-name-b' }]
    const result = diffEntities(a, b, 'name')

    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
    expect(result.changed).toEqual([])
    expect(result.unmatchedA).toEqual([{ host: 'no-name-a' }])
    expect(result.unmatchedB).toEqual([{ host: 'no-name-b' }])
  })

  it('handles undefined lists as empty', () => {
    const result = diffEntities(undefined, [{ name: 'only-in-b' }], 'name')
    expect(result.added).toEqual([{ name: 'only-in-b' }])
  })
})

describe('diffKongConfigs', () => {
  it('diffs services, consumers, global plugins, and per-service routes', () => {
    const a: KongConfig = {
      _format_version: '3.0',
      services: [
        {
          name: 'svc-a',
          host: 'a.internal',
          routes: [{ name: 'route-a', paths: ['/a'] }],
        } as KongService,
      ],
      consumers: [{ username: 'alice' }],
      plugins: [{ name: 'rate-limiting', config: { minute: 100 } }],
    }
    const b: KongConfig = {
      _format_version: '3.0',
      services: [
        {
          name: 'svc-a',
          host: 'a.internal',
          routes: [{ name: 'route-a', paths: ['/a', '/a2'] }],
        } as KongService,
      ],
      consumers: [{ username: 'alice' }, { username: 'bob' }],
      plugins: [{ name: 'rate-limiting', config: { minute: 200 } }],
    }

    const diff = diffKongConfigs(a, b)

    expect(diff.services.changed).toHaveLength(0)
    expect(diff.consumers.added).toEqual([{ username: 'bob' }])
    expect(diff.globalPlugins.changed[0].changes).toEqual([
      { path: 'config.minute', before: 100, after: 200 },
    ])
    expect(diff.routesByService.get('svc-a')?.changed[0].changes).toEqual([
      { path: 'paths', before: ['/a'], after: ['/a', '/a2'] },
    ])
  })
})
