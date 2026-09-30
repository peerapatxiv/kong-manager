// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSavedConnectionsStore } from './savedConnections'
import { loadSavedConnections } from '../lib/savedConnections'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSavedConnectionsStore', () => {
  it('starts with connections already persisted in localStorage', () => {
    localStorage.setItem(
      'kong-manager:saved-connections',
      JSON.stringify([{ id: '1', baseUrl: 'http://localhost:8001' }]),
    )

    const store = useSavedConnectionsStore()
    expect(store.connections).toEqual([{ id: '1', baseUrl: 'http://localhost:8001' }])
  })

  it('adds a new connection and persists it', () => {
    const store = useSavedConnectionsStore()

    store.upsert({ baseUrl: 'http://localhost:8001', username: 'admin', password: 'hunter2' })

    expect(store.connections).toHaveLength(1)
    expect(store.connections[0]).toMatchObject({
      baseUrl: 'http://localhost:8001',
      username: 'admin',
      password: 'hunter2',
    })
    expect(store.connections[0].id).toBeTruthy()
    expect(loadSavedConnections()).toEqual(store.connections)
  })

  it('updates an existing connection with the same base URL instead of duplicating it', () => {
    const store = useSavedConnectionsStore()
    store.upsert({ baseUrl: 'http://localhost:8001', username: 'admin', password: 'old-pass' })
    const id = store.connections[0].id

    store.upsert({ baseUrl: 'http://localhost:8001', username: 'admin', password: 'new-pass' })

    expect(store.connections).toHaveLength(1)
    expect(store.connections[0]).toMatchObject({ id, password: 'new-pass' })
  })

  it('removes a connection by id and persists the removal', () => {
    const store = useSavedConnectionsStore()
    store.upsert({ baseUrl: 'http://localhost:8001' })
    const id = store.connections[0].id

    store.remove(id)

    expect(store.connections).toEqual([])
    expect(loadSavedConnections()).toEqual([])
  })

  it('stamps createdAt on a new connection and stores its name', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const store = useSavedConnectionsStore()

    store.upsert({ baseUrl: 'http://kong:8001', name: 'Staging' })

    expect(store.connections[0]).toMatchObject({ name: 'Staging', createdAt: 1_700_000_000_000 })
  })

  it('keeps name and createdAt when a reconnect passes only the URL and credentials', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const store = useSavedConnectionsStore()
    store.upsert({ baseUrl: 'http://kong:8001', name: 'Staging', autoConnect: true })

    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    store.upsert({ baseUrl: 'http://kong:8001', username: 'admin' })

    expect(store.connections[0]).toMatchObject({
      name: 'Staging',
      createdAt: 1_700_000_000_000,
      autoConnect: true,
      username: 'admin',
    })
  })

  it('overwrites the name when a new value are given for an existing URL', () => {
    const store = useSavedConnectionsStore()
    store.upsert({ baseUrl: 'http://kong:8001', name: 'Old' })

    store.upsert({ baseUrl: 'http://kong:8001', name: 'New' })

    expect(store.connections).toHaveLength(1)
    expect(store.connections[0]).toMatchObject({ name: 'New' })
  })

  it('does not keep a colour, even if one is passed', () => {
    const store = useSavedConnectionsStore()

    store.upsert({ baseUrl: 'http://kong:8001', colorCode: '#ff0000' } as never)

    expect(store.connections[0]).not.toHaveProperty('colorCode')
  })

  it('allows only one automatic connection: marking one clears the others', () => {
    const store = useSavedConnectionsStore()
    store.upsert({ baseUrl: 'http://a:8001', autoConnect: true })
    store.upsert({ baseUrl: 'http://b:8001', autoConnect: true })

    expect(store.connections.find((c) => c.baseUrl === 'http://a:8001')?.autoConnect).toBeFalsy()
    expect(store.autoConnection?.baseUrl).toBe('http://b:8001')
    expect(loadSavedConnections().filter((c) => c.autoConnect)).toHaveLength(1)
  })

  it('un-marking the automatic connection leaves none, and autoConnection is null without one', () => {
    const store = useSavedConnectionsStore()
    expect(store.autoConnection).toBeNull()
    store.upsert({ baseUrl: 'http://a:8001', autoConnect: true })

    store.upsert({ baseUrl: 'http://a:8001', autoConnect: false })

    expect(store.autoConnection).toBeNull()
  })

  it('tracks whether auto-connect was attempted this session, without persisting it', () => {
    const store = useSavedConnectionsStore()
    expect(store.autoConnectTried).toBe(false)

    store.markAutoConnectTried()

    expect(store.autoConnectTried).toBe(true)
    expect(localStorage.getItem('kong-manager:saved-connections')).toBeNull()
  })
})
