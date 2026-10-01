// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import SavedConnectionsList from './SavedConnectionsList.vue'
import { useSavedConnectionsStore } from '../stores/savedConnections'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SavedConnectionsList', () => {
  it('shows a Saved Connections panel with a placeholder when there are none', () => {
    const wrapper = mount(SavedConnectionsList)

    expect(wrapper.text()).toContain('Saved Connections')
    expect(wrapper.text()).toContain('No connections are saved!')
    expect(wrapper.findAll('li')).toHaveLength(0)
  })

  it('explains how to fill the empty panel, with an icon', () => {
    const wrapper = mount(SavedConnectionsList)

    expect(wrapper.find('[data-testid="saved-empty"]').text()).toContain('No connections are saved!')
    expect(wrapper.find('[data-testid="saved-empty"]').text()).toContain('Connect once and it will be saved here.')
    expect(wrapper.find('[data-testid="saved-empty"] svg').exists()).toBe(true)
  })

  it('lists each saved connection by base URL and username', () => {
    const store = useSavedConnectionsStore()
    store.upsert({ baseUrl: 'http://localhost:8001', username: 'admin', password: 'hunter2' })
    store.upsert({ baseUrl: 'http://localhost:8002' })

    const wrapper = mount(SavedConnectionsList)

    expect(wrapper.text()).toContain('http://localhost:8001')
    expect(wrapper.text()).toContain('admin')
    expect(wrapper.text()).toContain('http://localhost:8002')
  })

  it('emits connect with the stored credentials when a row is clicked', async () => {
    const store = useSavedConnectionsStore()
    store.upsert({ baseUrl: 'http://localhost:8001', username: 'admin', password: 'hunter2' })

    const wrapper = mount(SavedConnectionsList)
    await wrapper.find('li').trigger('click')

    expect(wrapper.emitted('connect')).toEqual([
      [{ baseUrl: 'http://localhost:8001', username: 'admin', password: 'hunter2' }],
    ])
  })

  it('deletes a connection when its delete button is clicked, without emitting connect', async () => {
    const store = useSavedConnectionsStore()
    store.upsert({ baseUrl: 'http://localhost:8001' })

    const wrapper = mount(SavedConnectionsList)
    await wrapper.find('button[aria-label="Delete saved connection"]').trigger('click')

    expect(store.connections).toEqual([])
    expect(wrapper.emitted('connect')).toBeUndefined()
  })

  it('shows each connection with its name and URL, without a created date', () => {
    const store = useSavedConnectionsStore()
    store.upsert({ baseUrl: 'https://kong.internal:8444', name: 'Staging server' })

    const wrapper = mount(SavedConnectionsList)

    const row = wrapper.find('li')
    expect(row.find('strong').text()).toBe('Staging server')
    expect(row.text()).toContain('https://kong.internal:8444')
    expect(row.text()).not.toContain('Created on')
    expect(row.find('[data-testid="connection-icon"]').attributes('style')).toBeUndefined()
  })

  it('falls back to the host for older entries without a name', () => {
    localStorage.setItem(
      'kong-manager:saved-connections',
      JSON.stringify([{ id: '1', baseUrl: 'http://localhost:8002' }]),
    )
    setActivePinia(createPinia())

    const wrapper = mount(SavedConnectionsList)

    const row = wrapper.find('li')
    expect(row.find('strong').text()).toBe('localhost:8002')
    expect(row.text()).not.toContain('Created on')
  })

  it('shows no Auto badge, even for an older entry that still carries the flag', () => {
    localStorage.setItem(
      'kong-manager:saved-connections',
      JSON.stringify([{ id: '1', baseUrl: 'http://a:8001', autoConnect: true }]),
    )
    setActivePinia(createPinia())

    expect(mount(SavedConnectionsList).find('li').text()).not.toContain('Auto')
  })
})
