// src/stores/config.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigStore } from './config'
import * as kongAdminApi from '../lib/kongAdminApi'
import type { KongConfig } from '../types/kong'

vi.mock('../lib/kongAdminApi')

const SAMPLE = `_format_version: "3.0"
services:
- name: svc-a
  host: a.internal
  routes:
  - name: route-a
    paths:
    - /a
consumers:
- username: alice
plugins:
- name: rate-limiting
`

describe('useConfigStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('starts empty and unloaded', () => {
    const store = useConfigStore()
    expect(store.isLoaded).toBe(false)
  })

  it('loads a primary config and computes summary counts', () => {
    const store = useConfigStore()
    store.loadPrimary('sample.yaml', SAMPLE)

    expect(store.isLoaded).toBe(true)
    expect(store.summary).toEqual({ services: 1, routes: 1, consumers: 1, globalPlugins: 1 })
  })

  it('propagates parse errors instead of silently loading nothing', () => {
    const store = useConfigStore()
    expect(() => store.loadPrimary('bad.yaml', 'services: [unclosed')).toThrow()
    expect(store.isLoaded).toBe(false)
  })

  it('tracks per-entity modified flags', () => {
    const store = useConfigStore()
    store.loadPrimary('sample.yaml', SAMPLE)

    expect(store.isModified('service:svc-a')).toBe(false)
    store.markModified('service:svc-a')
    expect(store.isModified('service:svc-a')).toBe(true)
    expect(store.isModified('service:svc-b')).toBe(false)
  })

  it('exports the current in-memory object, including in-place edits', () => {
    const store = useConfigStore()
    store.loadPrimary('kong-config.yaml', SAMPLE)
    store.primary!.config.services![0].host = 'edited.internal'

    const { fileName, contents } = store.exportYaml()

    expect(fileName).toBe('kong-config-edited.yaml')
    expect(contents).toContain('edited.internal')
  })

  it('clears a stale compareTarget when a new primary file is loaded', () => {
    const store = useConfigStore()
    store.loadPrimary('sample.yaml', SAMPLE)
    store.loadCompareTarget('other.yaml', SAMPLE)
    expect(store.compareTarget).not.toBeNull()

    store.loadPrimary('sample.yaml', SAMPLE)
    expect(store.compareTarget).toBeNull()
  })

  describe('Kong Admin API integration', () => {
    it('loads a config pulled from a live Kong Admin API as the primary source', async () => {
      const store = useConfigStore()
      const pulled: KongConfig = { _format_version: '3.0', services: [{ host: 'live.internal', name: 'svc-live' }] }
      vi.mocked(kongAdminApi.getConfig).mockResolvedValue(pulled)

      await store.loadFromKongAdmin('http://localhost:8001', { token: 'token-123' })

      expect(kongAdminApi.getConfig).toHaveBeenCalledWith('http://localhost:8001', { token: 'token-123' })
      expect(store.isLoaded).toBe(true)
      expect(store.primary!.origin).toBe('kong-admin')
      expect(store.primary!.baseUrl).toBe('http://localhost:8001')
      expect(store.primary!.fileName).toBe('Kong Admin @ http://localhost:8001')
      expect(store.primary!.config).toEqual(pulled)
    })

    it('clears a stale compareTarget when loading from Kong Admin API', async () => {
      const store = useConfigStore()
      store.loadPrimary('sample.yaml', SAMPLE)
      store.loadCompareTarget('other.yaml', SAMPLE)
      vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0' })

      await store.loadFromKongAdmin('http://localhost:8001')

      expect(store.compareTarget).toBeNull()
    })

    it('propagates getConfig errors instead of silently loading nothing', async () => {
      const store = useConfigStore()
      vi.mocked(kongAdminApi.getConfig).mockRejectedValue(new Error('connection refused'))

      await expect(store.loadFromKongAdmin('http://localhost:8001')).rejects.toThrow('connection refused')
      expect(store.isLoaded).toBe(false)
    })

    it('pushes the current in-memory config to the given Kong Admin API', async () => {
      const store = useConfigStore()
      store.loadPrimary('kong-config.yaml', SAMPLE)
      store.primary!.config.services![0].host = 'edited.internal'
      vi.mocked(kongAdminApi.setConfig).mockResolvedValue(undefined)

      await store.pushToKongAdmin('http://localhost:8001', { token: 'token-123' })

      expect(kongAdminApi.setConfig).toHaveBeenCalledWith(
        'http://localhost:8001',
        expect.objectContaining({
          services: expect.arrayContaining([expect.objectContaining({ host: 'edited.internal' })]),
        }),
        { token: 'token-123' },
      )
    })

    it('passes username/password Basic Auth through to the Kong Admin API client', async () => {
      const store = useConfigStore()
      vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0' })

      await store.loadFromKongAdmin('http://localhost:8001', { username: 'admin', password: 'hunter2' })

      expect(kongAdminApi.getConfig).toHaveBeenCalledWith('http://localhost:8001', {
        username: 'admin',
        password: 'hunter2',
      })
    })

    it('throws and leaves state untouched when pushing with nothing loaded', async () => {
      const store = useConfigStore()

      await expect(store.pushToKongAdmin('http://localhost:8001')).rejects.toThrow('No config loaded')
      expect(kongAdminApi.setConfig).not.toHaveBeenCalled()
    })

    it('marks file-loaded configs with origin "file" and no baseUrl', () => {
      const store = useConfigStore()
      store.loadPrimary('sample.yaml', SAMPLE)

      expect(store.primary!.origin).toBe('file')
      expect(store.primary!.baseUrl).toBeUndefined()
    })
  })

  it('clear() unloads the primary config, the compare target and all modified markers', () => {
    const store = useConfigStore()
    store.loadPrimary('a.yaml', SAMPLE)
    store.loadCompareTarget('b.yaml', SAMPLE)
    store.markModified('service:svc-a')

    store.clear()

    expect(store.primary).toBeNull()
    expect(store.compareTarget).toBeNull()
    expect(store.isLoaded).toBe(false)
    expect(store.modifiedKeys.size).toBe(0)
  })
})
