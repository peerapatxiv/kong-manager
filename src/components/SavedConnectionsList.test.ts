// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import SavedConnectionsList from './SavedConnectionsList.vue'
import { useSavedConnectionsStore } from '../stores/savedConnections'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('SavedConnectionsList', () => {
  it('renders nothing when there are no saved connections', () => {
    const wrapper = mount(SavedConnectionsList)
    expect(wrapper.text()).toBe('')
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
})
