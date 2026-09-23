// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import CompareView from './CompareView.vue'
import FileDropZone from '../components/FileDropZone.vue'
import { useConfigStore } from '../stores/config'

const fixturesDir = resolve(process.cwd(), 'fixtures')
const SAMPLE_A = readFileSync(resolve(fixturesDir, 'sample-a.yaml'), 'utf-8')
const SAMPLE_B = readFileSync(resolve(fixturesDir, 'sample-b.yaml'), 'utf-8')

describe('CompareView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useConfigStore()
    store.loadPrimary('sample-a.yaml', SAMPLE_A)
  })

  it('shows no diff sections until a second file is loaded', () => {
    const wrapper = mount(CompareView)
    expect(wrapper.text()).not.toContain('added')
  })

  it('shows a parse-error banner instead of crashing on a bad File B', async () => {
    const wrapper = mount(CompareView)
    await wrapper.findComponent(FileDropZone).vm.$emit('file-selected', {
      fileName: 'bad.yaml',
      text: 'services: [unclosed',
    })

    expect(wrapper.text()).toContain('Failed to parse YAML')
  })

  it('diffs services/consumers/plugins/routes between the two fixtures', async () => {
    const wrapper = mount(CompareView)
    await wrapper.findComponent(FileDropZone).vm.$emit('file-selected', {
      fileName: 'sample-b.yaml',
      text: SAMPLE_B,
    })

    const text = wrapper.text()
    // Services: notifications-service added, reporting-service removed, billing-service changed.
    expect(text).toContain('notifications-service')
    expect(text).toContain('reporting-service')
    expect(text).toContain('billing-service')
    // Consumers: bob added.
    expect(text).toContain('bob')
    // Global plugins: rate-limiting's config.minute changed 100 -> 200.
    expect(text).toContain('rate-limiting')
    expect(text).toContain('config.minute')
  })

  it('masks a changed secret-like field by default, with a reveal toggle', async () => {
    setActivePinia(createPinia())
    const store = useConfigStore()
    store.loadPrimary(
      'a.yaml',
      `_format_version: "3.0"
consumers:
- username: alice
  keyauth_credentials:
  - key: old-secret-key
`,
    )

    const wrapper = mount(CompareView)
    await wrapper.findComponent(FileDropZone).vm.$emit('file-selected', {
      fileName: 'b.yaml',
      text: `_format_version: "3.0"
consumers:
- username: alice
  keyauth_credentials:
  - key: new-secret-key
`,
    })

    expect(wrapper.text()).not.toContain('old-secret-key')
    expect(wrapper.text()).not.toContain('new-secret-key')

    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('old-secret-key')
    expect(wrapper.text()).toContain('new-secret-key')
  })
})
