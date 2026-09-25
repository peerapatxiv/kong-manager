// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import PushToKongModal from './PushToKongModal.vue'
import { useConfigStore } from '../stores/config'
import * as kongAdminApi from '../lib/kongAdminApi'

vi.mock('../lib/kongAdminApi')

const SAMPLE = `_format_version: "3.0"
services:
- name: svc-a
  host: a.internal
`

describe('PushToKongModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const store = useConfigStore()
    store.loadPrimary('kong-config.yaml', SAMPLE)
  })

  it('is hidden when closed', () => {
    const wrapper = mount(PushToKongModal, { props: { open: false } })
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('pre-fills the base URL when the current source is a live Kong connection', async () => {
    const store = useConfigStore()
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
    await store.loadFromKongAdmin('http://localhost:8001')

    const wrapper = mount(PushToKongModal, { props: { open: true } })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('http://localhost:8001')
  })

  it('leaves the base URL blank when the current source is a file', () => {
    const wrapper = mount(PushToKongModal, { props: { open: true } })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
  })

  it('requires an explicit confirm step before pushing, showing a warning first', async () => {
    const wrapper = mount(PushToKongModal, { props: { open: true } })
    await wrapper.find('input').setValue('http://localhost:8001')

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Push to Kong')!
      .trigger('click')

    expect(wrapper.text()).toContain('replaces the entire declarative config')
    expect(kongAdminApi.setConfig).not.toHaveBeenCalled()

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirm push')!
      .trigger('click')
    await flushPromises()

    expect(kongAdminApi.setConfig).toHaveBeenCalledWith('http://localhost:8001', expect.any(Object), {
      username: undefined,
      password: undefined,
    })
    expect(wrapper.text()).toContain('Config pushed')
  })

  it('passes username and password through as Basic Auth when entered', async () => {
    const wrapper = mount(PushToKongModal, { props: { open: true } })
    await wrapper.find('input[type="text"]').setValue('http://localhost:8001')
    await wrapper.find('input[placeholder="Username"]').setValue('admin')
    await wrapper.find('input[type="password"]').setValue('hunter2')

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Push to Kong')!
      .trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirm push')!
      .trigger('click')
    await flushPromises()

    expect(kongAdminApi.setConfig).toHaveBeenCalledWith('http://localhost:8001', expect.any(Object), {
      username: 'admin',
      password: 'hunter2',
    })
  })

  it('does not advance to the confirm step when the base URL is blank', async () => {
    const wrapper = mount(PushToKongModal, { props: { open: true } })

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Push to Kong')!
      .trigger('click')

    expect(wrapper.text()).not.toContain('replaces the entire declarative config')
  })

  it('shows an inline error and keeps the modal open when the push fails', async () => {
    vi.mocked(kongAdminApi.setConfig).mockRejectedValue(new Error('bad config'))
    const wrapper = mount(PushToKongModal, { props: { open: true } })
    await wrapper.find('input').setValue('http://localhost:8001')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Push to Kong')!
      .trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirm push')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('bad config')
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('closing without pushing emits close and does not touch the remote instance', async () => {
    const wrapper = mount(PushToKongModal, { props: { open: true } })
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Cancel')!
      .trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(kongAdminApi.setConfig).not.toHaveBeenCalled()
  })
})
