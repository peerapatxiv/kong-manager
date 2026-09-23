// src/stores/config.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigStore } from './config'

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
})
