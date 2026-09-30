// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import LiveServicesView from './LiveServicesView.vue'
import { useConnectionStore } from '../../stores/connection'

type Call = { method: string; url: string; body?: Record<string, unknown> }
type Reply = { ok: boolean; status: number; json?: () => Promise<unknown>; text: () => Promise<string> }

function fakeKong(services: Record<string, unknown>[], failCreateWith?: { status: number; body: unknown }) {
  const calls: Call[] = []
  const reply = (body: unknown, status = 200): Reply => ({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}): Promise<Reply> => {
      const method = init.method ?? 'GET'
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
      calls.push({ method, url, body })
      if (method === 'GET' && url.includes('/services')) return reply({ data: services })
      if (method === 'POST') {
        if (failCreateWith) return reply(failCreateWith.body, failCreateWith.status)
        return reply({ id: 'new-1', ...body }, 201)
      }
      if (method === 'PATCH') {
        const id = url.split('/services/')[1]
        return reply({ ...services.find((s) => s.id === id), ...body })
      }
      if (method === 'DELETE') return { ok: true, status: 204, text: async () => '' }
      return reply({}, 404)
    }),
  )
  return calls
}

const SERVICES = [
  { id: 'svc-1', name: 'billing', protocol: 'http', host: 'billing.internal', port: 8080, path: '/', enabled: true, tags: ['prod'] },
  { id: 'svc-2', name: 'reports', protocol: 'https', host: 'reports.internal', port: 443, enabled: false, tags: [] },
]

function connect(database = 'postgres') {
  useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database } })
}

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  const wrapper = mount(LiveServicesView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const byId = (wrapper: Awaited<ReturnType<typeof mountView>>, id: string) => wrapper.find(`[data-testid="${id}"]`)

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LiveServicesView', () => {
  it('shows the connect prompt and sends no request when not connected', async () => {
    const calls = fakeKong(SERVICES)

    const wrapper = await mountView()

    expect(byId(wrapper, 'live-not-connected').exists()).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('lists services from the API and filters the loaded ones by the search box', async () => {
    connect()
    fakeKong(SERVICES)

    const wrapper = await mountView()

    const rows = wrapper.findAll('[data-testid="service-row"]')
    expect(rows.map((r) => r.text())).toEqual([expect.stringContaining('billing'), expect.stringContaining('reports')])

    await wrapper.find('input[placeholder="Search loaded services…"]').setValue('report')
    expect(wrapper.findAll('[data-testid="service-row"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="service-row"]').text()).toContain('reports')
  })

  it('applies the tag filter through the API on Enter', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    const wrapper = await mountView()

    const input = byId(wrapper, 'tag-filter')
    await input.setValue('prod, eu')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(calls.at(-1)?.url).toBe('http://kong:8001/services?tags=prod%2Ceu')
  })

  it('on DB-less Kong shows the notice and disables every write control', async () => {
    connect('off')
    fakeKong(SERVICES)
    const wrapper = await mountView()

    expect(byId(wrapper, 'live-read-only').exists()).toBe(true)
    expect(byId(wrapper, 'new-service').attributes('disabled')).toBeDefined()

    await wrapper.findAll('[data-testid="service-row"]')[0].trigger('click')
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()
    expect(byId(wrapper, 'delete').attributes('disabled')).toBeDefined()
    expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
  })

  it('edits a service and saves it with a PATCH carrying the change', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    const wrapper = await mountView()

    await wrapper.findAll('[data-testid="service-row"]')[0].trigger('click')
    expect((byId(wrapper, 'service-host').element as HTMLInputElement).value).toBe('billing.internal')
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()

    await byId(wrapper, 'service-host').setValue('new.internal')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toBe('http://kong:8001/services/svc-1')
    expect(patch.body).toMatchObject({ host: 'new.internal', protocol: 'http', name: 'billing' })
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()
  })

  it('creates a service with a POST and adds it to the list', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    const wrapper = await mountView()

    await byId(wrapper, 'new-service').trigger('click')
    await byId(wrapper, 'service-name').setValue('  fresh ')
    await byId(wrapper, 'service-host').setValue('fresh.internal')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toBe('http://kong:8001/services')
    expect(post.body).toMatchObject({ name: 'fresh', host: 'fresh.internal', protocol: 'http' })
    expect(Object.values(post.body!).includes(null)).toBe(false)
    expect(wrapper.findAll('[data-testid="service-row"]')[0].text()).toContain('fresh')
  })

  it('blocks Save with a banner and sends nothing when the host is empty', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    const wrapper = await mountView()

    await byId(wrapper, 'new-service').trigger('click')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Please provide a valid protocol and host combination.')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('shows Kong field errors in the banner and under the field, keeping the form open', async () => {
    connect()
    fakeKong(SERVICES, {
      status: 400,
      body: { message: 'schema violation (host: invalid value)', fields: { host: 'invalid value' } },
    })
    const wrapper = await mountView()

    await byId(wrapper, 'new-service').trigger('click')
    await byId(wrapper, 'service-host').setValue('bad host')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('schema violation (host: invalid value)')
    expect(wrapper.find('[role="alert"]').text()).toContain('host: invalid value')
    expect(wrapper.text()).toContain('invalid value')
    expect((byId(wrapper, 'service-host').element as HTMLInputElement).value).toBe('bad host')
  })

  it('deletes the selected service after confirmation and removes it from the list', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = await mountView()

    await wrapper.findAll('[data-testid="service-row"]')[0].trigger('click')
    await byId(wrapper, 'delete').trigger('click')
    await flushPromises()

    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('http://kong:8001/services/svc-1')
    expect(wrapper.findAll('[data-testid="service-row"]')).toHaveLength(1)
  })

  it('does not delete when the confirmation is cancelled', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    await wrapper.findAll('[data-testid="service-row"]')[0].trigger('click')
    await byId(wrapper, 'delete').trigger('click')
    await flushPromises()

    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('asks before discarding edits when switching selection, and keeps them on cancel', async () => {
    connect()
    fakeKong(SERVICES)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    const rows = () => wrapper.findAll('[data-testid="service-row"]')
    await rows()[0].trigger('click')
    await byId(wrapper, 'service-host').setValue('edited.internal')
    await rows()[1].trigger('click')

    expect(confirm).toHaveBeenCalled()
    expect((byId(wrapper, 'service-host').element as HTMLInputElement).value).toBe('edited.internal')

    confirm.mockReturnValue(true)
    await rows()[1].trigger('click')
    expect((byId(wrapper, 'service-host').element as HTMLInputElement).value).toBe('reports.internal')
  })

  it('Discard reverts edits only after confirmation', async () => {
    connect()
    fakeKong(SERVICES)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    await wrapper.findAll('[data-testid="service-row"]')[0].trigger('click')
    await byId(wrapper, 'service-host').setValue('edited.internal')
    await byId(wrapper, 'discard').trigger('click')
    expect((byId(wrapper, 'service-host').element as HTMLInputElement).value).toBe('edited.internal')

    confirm.mockReturnValue(true)
    await byId(wrapper, 'discard').trigger('click')
    expect((byId(wrapper, 'service-host').element as HTMLInputElement).value).toBe('billing.internal')
  })

  it('toggles a service enabled flag from the list with a PATCH of only that flag', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    const wrapper = await mountView()

    await wrapper.findAll('[data-testid="service-row"]')[0].find('input[type="checkbox"]').setValue(false)
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toBe('http://kong:8001/services/svc-1')
    expect(patch.body).toEqual({ enabled: false })
  })

  it('asks before leaving the page with unsaved edits, and stays when cancelled', async () => {
    connect()
    fakeKong(SERVICES)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>home</div>' } },
        { path: '/live/services', component: LiveServicesView },
      ],
    })
    router.push('/live/services')
    await router.isReady()
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="service-row"]')[0].trigger('click')
    await wrapper.find('[data-testid="service-host"]').setValue('edited.internal')
    await router.push('/')
    expect(confirm).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/live/services')

    confirm.mockReturnValue(true)
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('leaves the page without asking when there are no unsaved edits', async () => {
    connect()
    fakeKong(SERVICES)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>home</div>' } },
        { path: '/live/services', component: LiveServicesView },
      ],
    })
    router.push('/live/services')
    await router.isReady()
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="service-row"]')[0].trigger('click')
    await router.push('/')

    expect(confirm).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/')
  })
})
