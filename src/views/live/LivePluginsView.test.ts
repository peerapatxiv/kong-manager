// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import LivePluginsView from './LivePluginsView.vue'
import { useConnectionStore } from '../../stores/connection'

type Call = { method: string; url: string; body?: Record<string, unknown> }
type Reply = { ok: boolean; status: number; json?: () => Promise<unknown>; text: () => Promise<string> }

const SERVICES = [{ id: 'svc-1', name: 'billing', host: 'billing.internal' }]
const ROUTES = [{ id: 'r-1', name: 'billing-route', paths: ['/billing'] }]
const CONSUMERS = [{ id: 'c-1', username: 'alice' }]
const PLUGINS = [
  { id: 'p-1', name: 'cors', enabled: true, protocols: ['http', 'https'], tags: [], config: { max_age: 3600 } },
  {
    id: 'p-2',
    name: 'rate-limiting',
    enabled: false,
    protocols: ['https'],
    tags: ['t'],
    config: { minute: 10 },
    service: { id: 'svc-1' },
    consumer: { id: 'c-1' },
  },
]

function fakeKong(failCreateWith?: { status: number; body: unknown }) {
  const calls: Call[] = []
  const reply = (body: unknown, status = 200): Reply => ({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}): Promise<Reply> => {
      const method = init.method ?? 'GET'
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
      const url = new URL(input)
      calls.push({ method, url: input, body })
      if (method === 'GET') {
        const data = { '/plugins': PLUGINS, '/services': SERVICES, '/routes': ROUTES, '/consumers': CONSUMERS }[url.pathname]
        return data ? reply({ data }) : reply({}, 404)
      }
      if (method === 'POST') {
        if (failCreateWith) return reply(failCreateWith.body, failCreateWith.status)
        return reply({ id: 'p-new', ...body }, 201)
      }
      if (method === 'PATCH') {
        const id = url.pathname.split('/plugins/')[1]
        return reply({ ...PLUGINS.find((p) => p.id === id), ...body })
      }
      if (method === 'DELETE') return { ok: true, status: 204, text: async () => '' }
      return reply({}, 404)
    }),
  )
  return calls
}

function connect(database = 'postgres') {
  useConnectionStore().$patch({
    active: { baseUrl: 'http://kong:8001' },
    info: { version: '3.5.0', database },
    availablePlugins: ['cors', 'key-auth', 'rate-limiting'],
  })
}

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  const wrapper = mount(LivePluginsView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
type Wrapper = Awaited<ReturnType<typeof mountView>>
const byId = (wrapper: Wrapper, id: string) => wrapper.find(`[data-testid="${id}"]`)
const rows = (wrapper: Wrapper) => wrapper.findAll('[data-testid="plugin-row"]')
async function choose(wrapper: Wrapper, id: string, value: string) {
  await byId(wrapper, id).find('button').trigger('click')
  await byId(wrapper, id).find(`[role="option"][data-value="${value}"]`).trigger('click')
}

let mounted: Wrapper | undefined
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  mounted?.unmount()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function open() {
  mounted = await mountView()
  return mounted
}

describe('LivePluginsView', () => {
  it('shows the connect prompt and sends no request when not connected', async () => {
    const calls = fakeKong()
    const wrapper = await open()

    expect(byId(wrapper, 'live-not-connected').exists()).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('lists plugins by name only, leaving where each one applies to the form', async () => {
    connect()
    fakeKong()
    const wrapper = await open()

    expect(rows(wrapper)).toHaveLength(2)
    expect(rows(wrapper)[0].text()).toBe('cors')
    expect(rows(wrapper)[1].text()).toBe('rate-limiting')
  })

  it('searches by plugin name and by what it applies to', async () => {
    connect()
    fakeKong()
    const wrapper = await open()

    await wrapper.find('input[placeholder="Search loaded plugins…"]').setValue('alice')
    expect(rows(wrapper)).toHaveLength(1)
    expect(rows(wrapper)[0].text()).toContain('rate-limiting')
    await wrapper.find('input[placeholder="Search loaded plugins…"]').setValue('cors')
    expect(rows(wrapper)).toHaveLength(1)
  })

  it('opens a plugin with its name locked and its scope filled in', async () => {
    connect()
    fakeKong()
    const wrapper = await open()
    await rows(wrapper)[1].trigger('click')

    expect(byId(wrapper, 'plugin-name').find('button').attributes('disabled')).toBeDefined()
    expect(byId(wrapper, 'plugin-name').text()).toContain('rate-limiting')
    expect(byId(wrapper, 'plugin-service').attributes('data-value')).toBe('svc-1')
    expect(byId(wrapper, 'plugin-consumer').attributes('data-value')).toBe('c-1')
    expect(byId(wrapper, 'plugin-route').attributes('data-value')).toBe('')
  })

  it('saves an edited config with a PATCH that does not send the name', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await open()
    await rows(wrapper)[1].trigger('click')

    await byId(wrapper, 'config-mode').find('[data-value="json"]').trigger('click')
    await byId(wrapper, 'config-json').setValue('{"minute": 25}')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toBe('http://kong:8001/plugins/p-2')
    expect(patch.body).toMatchObject({ config: { minute: 25 }, service: { id: 'svc-1' }, consumer: { id: 'c-1' }, route: null })
    expect(patch.body).not.toHaveProperty('name')
  })

  it('creates a plugin chosen from the installed ones, sending no null values', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await open()

    await byId(wrapper, 'new-plugin').trigger('click')
    await choose(wrapper, 'plugin-name', 'key-auth')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toBe('http://kong:8001/plugins')
    expect(post.body).toMatchObject({ name: 'key-auth', enabled: true })
    expect(Object.values(post.body!).some((value) => value === null)).toBe(false)
  })

  it('will not create a plugin until one is chosen, and says so', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await open()

    await byId(wrapper, 'new-plugin').trigger('click')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Please choose a plugin.')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('shows what Kong rejected and keeps the form open', async () => {
    connect()
    fakeKong({ status: 400, body: { message: 'schema violation', fields: { config: 'minute is required' } } })
    const wrapper = await open()

    await byId(wrapper, 'new-plugin').trigger('click')
    await choose(wrapper, 'plugin-name', 'rate-limiting')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('schema violation')
    expect(wrapper.text()).toContain('minute is required')
    expect(byId(wrapper, 'plugin-name').exists()).toBe(true)
  })

  it('enables or disables a plugin straight from the list', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await open()

    await rows(wrapper)[0].find('input[type="checkbox"]').setValue(false)
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toBe('http://kong:8001/plugins/p-1')
    expect(patch.body).toEqual({ enabled: false })
  })

  it('deletes after confirming, and not when cancelled', async () => {
    connect()
    const calls = fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const wrapper = await open()
    await rows(wrapper)[0].trigger('click')

    await byId(wrapper, 'delete').trigger('click')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await byId(wrapper, 'delete').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith('Delete this plugin?')
    expect(calls.find((c) => c.method === 'DELETE')!.url).toBe('http://kong:8001/plugins/p-1')
    expect(rows(wrapper)).toHaveLength(1)
  })

  it('asks before discarding edits when another plugin is picked, and keeps them on cancel', async () => {
    connect()
    fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await open()
    await rows(wrapper)[0].trigger('click')
    await byId(wrapper, 'config-mode').find('[data-value="json"]').trigger('click')
    await byId(wrapper, 'config-json').setValue('{"max_age": 1}')

    await rows(wrapper)[1].trigger('click')

    expect(confirm).toHaveBeenCalledWith('Discard your unsaved changes?')
    expect(byId(wrapper, 'plugin-name').text()).toContain('cors')
  })

  it('on DB-less Kong shows the notice and disables every write control', async () => {
    connect('off')
    fakeKong()
    const wrapper = await open()

    expect(byId(wrapper, 'live-read-only').exists()).toBe(true)
    expect(byId(wrapper, 'new-plugin').attributes('disabled')).toBeDefined()
  })

  it('has no tag filter or Load more button, like the other live lists', async () => {
    connect()
    fakeKong()
    const wrapper = await open()

    expect(byId(wrapper, 'tag-filter').exists()).toBe(false)
    expect(byId(wrapper, 'load-more').exists()).toBe(false)
  })
})
