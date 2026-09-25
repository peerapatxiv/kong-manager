// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSavedConnectionsStore } from './savedConnections'
import { loadSavedConnections } from '../lib/savedConnections'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
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
})
