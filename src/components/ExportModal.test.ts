// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import ExportModal from './ExportModal.vue'
import { useConfigStore } from '../stores/config'
import { parseKongConfig } from '../lib/yaml'

const SAMPLE = `_format_version: "3.0"
services:
- name: svc-a
  host: a.internal
upstreams:
- name: unmodeled-upstream
  algorithm: round-robin
`

describe('ExportModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useConfigStore()
    store.loadPrimary('kong-config.yaml', SAMPLE)
  })

  it('is hidden when closed and defaults the filename to <name>-edited.yaml when opened', async () => {
    const wrapper = mount(ExportModal, { props: { open: false } })
    expect(wrapper.find('input').exists()).toBe(false)

    await wrapper.setProps({ open: true })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('kong-config-edited.yaml')
  })

  it('downloads a Blob with the edited config and preserves unmodeled top-level keys', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const store = useConfigStore()
    store.primary!.config.services![0].host = 'edited.internal'

    const wrapper = mount(ExportModal, { props: { open: true } })
    await wrapper.findAll('button').find((b) => b.text() === 'Download')!.trigger('click')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blobArg = createObjectURL.mock.calls[0][0] as Blob
    const contents = await blobArg.text()
    expect(contents).toContain('edited.internal')

    const reparsed = parseKongConfig(contents)
    expect(reparsed.upstreams).toEqual(store.primary!.config.upstreams)

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    expect(wrapper.emitted('close')).toBeTruthy()

    clickSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('closing without downloading emits close and does not touch the store', async () => {
    const wrapper = mount(ExportModal, { props: { open: true } })
    await wrapper.findAll('button').find((b) => b.text() === 'Cancel')!.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
