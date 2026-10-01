// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import FileDashboard from './FileDashboard.vue'
import { useConfigStore } from '../../stores/config'

const YAML = `_format_version: "3.0"
services:
- name: billing
  host: billing.internal
  plugins:
  - name: key-auth
  routes:
  - name: pay
    paths: [/pay]
    protocols: [https]
    plugins:
    - name: cors
- name: reports
  host: reports.internal
  enabled: false
  routes:
  - name: daily
    protocols: [grpc]
consumers:
- username: alice
plugins:
- name: cors
- name: rate-limiting
`

function make() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/file/services', '/file/routes', '/file/consumers', '/file/plugins'].map((path) => ({ path, component: { template: '<div />' } })),
  })
  return mount(FileDashboard, { global: { plugins: [router] } })
}
const tile = (w: ReturnType<typeof make>, id: string) => w.find(`[data-testid="tile-${id}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  useConfigStore().loadPrimary('kong-ce-pt.yaml', YAML)
})

describe('FileDashboard', () => {
  it('counts services, routes, consumers and every plugin, whatever level it is on', () => {
    const wrapper = make()
    expect(tile(wrapper, 'services').text()).toContain('2')
    expect(tile(wrapper, 'routes').text()).toContain('2')
    expect(tile(wrapper, 'consumers').text()).toContain('1')
    expect(tile(wrapper, 'plugins').text()).toContain('4')
  })

  it('links every tile to its page', () => {
    const wrapper = make()
    expect(tile(wrapper, 'services').attributes('href')).toBe('/file/services')
    expect(tile(wrapper, 'routes').attributes('href')).toBe('/file/routes')
    expect(tile(wrapper, 'consumers').attributes('href')).toBe('/file/consumers')
    expect(tile(wrapper, 'plugins').attributes('href')).toBe('/file/plugins')
  })

  it('splits services into enabled and disabled, routes by protocol, and lists the most used plugins', () => {
    const wrapper = make()
    expect(wrapper.find('[data-testid="card-services"]').text()).toContain('1 enabled')
    expect(wrapper.find('[data-testid="card-services"]').text()).toContain('1 disabled')
    const routes = wrapper.find('[data-testid="card-routes"]').text()
    expect(routes).toContain('https')
    expect(routes).toContain('grpc')
    expect(wrapper.find('[data-testid="card-plugins"]').text()).toContain('cors')
  })

  it('describes the file: its name, format version and where it came from', () => {
    const text = make().find('[data-testid="card-file"]').text()
    expect(text).toContain('kong-ce-pt.yaml')
    expect(text).toContain('3.0')
    expect(text).toContain('Uploaded file')
  })

  it('counts the unsaved edits, and notes there are none when there are none', () => {
    const store = useConfigStore()
    expect(make().find('[data-testid="card-file"]').text()).toContain('No edits')

    store.markModified('service:billing')
    store.markModified('plugin:global/cors')
    expect(make().find('[data-testid="card-file"]').text()).toContain('2 edited')
  })

  it('says so when the file has nothing to break down', () => {
    useConfigStore().loadPrimary('empty.yaml', '_format_version: "3.0"\n')
    const wrapper = make()
    expect(wrapper.find('[data-testid="card-routes"]').text()).toContain('No routes yet')
    expect(wrapper.find('[data-testid="card-plugins"]').text()).toContain('No plugins yet')
    expect(wrapper.find('[data-testid="card-services"]').text()).toContain('No services yet')
  })
})
