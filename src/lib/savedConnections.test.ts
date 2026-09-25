// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { loadSavedConnections, persistSavedConnections } from './savedConnections'
import type { SavedConnection } from './savedConnections'

beforeEach(() => {
  localStorage.clear()
})

describe('loadSavedConnections', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(loadSavedConnections()).toEqual([])
  })

  it('returns previously persisted connections', () => {
    const connections: SavedConnection[] = [{ id: '1', baseUrl: 'http://localhost:8001', username: 'admin' }]
    persistSavedConnections(connections)

    expect(loadSavedConnections()).toEqual(connections)
  })

  it('returns an empty array instead of throwing when the stored value is corrupt', () => {
    localStorage.setItem('kong-manager:saved-connections', '{not valid json')

    expect(loadSavedConnections()).toEqual([])
  })
})

describe('persistSavedConnections', () => {
  it('writes the connections list as JSON under the expected key', () => {
    const connections: SavedConnection[] = [{ id: '1', baseUrl: 'http://localhost:8001' }]
    persistSavedConnections(connections)

    expect(JSON.parse(localStorage.getItem('kong-manager:saved-connections')!)).toEqual(connections)
  })
})
