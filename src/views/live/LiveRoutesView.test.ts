// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import LiveRoutesView from './LiveRoutesView.vue'
import ProtocolPicker from '../../components/shared/ProtocolPicker.vue'
import { useConnectionStore } from '../../stores/connection'

type Call = { method: string; url: string; body?: Record<string, unknown> }
type Reply = { ok: boolean; status: number; json?: () => Promise<unknown>; text: () => Promise<string> }

const SERVICES = [
  { id: 'svc-1', name: 'billing', host: 'billing.internal' },
  { id: 'svc-2', name: 'reports', host: 'reports.internal' },
]
const ROUTES = [
  { id: 'r-1', name: 'billing-route', protocols: ['http'], paths: ['/billing'], hosts: [], methods: [], service: { id: 'svc-1' } },
  { id: 'r-2', name: 'reports-route', protocols: ['https'], paths: ['/reports'], hosts: ['r.example.com'], methods: ['GET'], service: { id: 'svc-2' } },
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
    vi.fn(async (url: string, init: RequestInit = {}): Promise<Reply> => {
      const method = init.method ?? 'GET'
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
      calls.push({ method, url, body })
      if (method === 'GET' && url.endsWith('/services')) return reply({ data: SERVICES })
      if (method === 'GET' && url.endsWith('/services/svc-1/routes')) return reply({ data: [ROUTES[0]] })
      if (method === 'GET' && url.endsWith('/routes')) return reply({ data: ROUTES })
      if (method === 'POST') {
        if (failCreateWith) return reply(failCreateWith.body, failCreateWith.status)
        return reply({ id: 'new-1', ...body }, 201)
      }
      if (method === 'PATCH') return reply({ ...ROUTES.find((r) => url.endsWith(`/routes/${r.id}`)), ...body })
      if (method === 'DELETE') return { ok: true, status: 204, text: async () => '' }
      return reply({}, 404)
    }),
  )
  return calls
}

function connect(database = 'postgres') {
  useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database } })
}

async function mountView(query = '') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/live/routes', component: { template: '<div />' } },
    ],
  })
  router.push(`/live/routes${query}`)
  await router.isReady()
  const wrapper = mount(LiveRoutesView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountView>>
const byId = (wrapper: Wrapper, id: string) => wrapper.find(`[data-testid="${id}"]`)
const rows = (wrapper: Wrapper) => wrapper.findAll('[data-testid="route-row"]')
// Opens one of the custom dropdowns and picks an option by its value.
async function choose(wrapper: Wrapper, id: string, value: string) {
  await byId(wrapper, id).find('button').trigger('click')
  await byId(wrapper, id).find(`[role="option"][data-value="${value}"]`).trigger('click')
}
const valueOf = (wrapper: Wrapper, id: string) => (byId(wrapper, id).element as HTMLInputElement).value

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProtocolPicker options', () => {
  it('offers the given options instead of the default list', () => {
    const wrapper = mount(ProtocolPicker, { props: { modelValue: [], options: ['tcp', 'tls_passthrough'] } })

    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(['tcp', 'tls_passthrough'])
  })

  it('still lists the default protocols when no options are given', () => {
    const wrapper = mount(ProtocolPicker, { props: { modelValue: [] } })

    expect(wrapper.findAll('button').map((b) => b.text())).toContain('http')
  })
})

describe('LiveRoutesView', () => {
  it('shows the connect prompt and sends no request when not connected', async () => {
    const calls = fakeKong()

    const wrapper = await mountView()

    expect(byId(wrapper, 'live-not-connected').exists()).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('lists each route by name with its methods and path, but not its service', async () => {
    connect()
    fakeKong()

    const wrapper = await mountView()

    expect(rows(wrapper)).toHaveLength(2)
    expect(rows(wrapper)[0].text()).toContain('billing-route')
    expect(rows(wrapper)[0].text()).toContain('/billing')
    expect(rows(wrapper)[1].text()).toContain('reports-route')
    expect(rows(wrapper)[1].text()).toContain('GET')
    expect(rows(wrapper)[1].text()).toContain('/reports')
    expect(rows(wrapper)[1].text()).not.toContain('reports.internal')
  })

  it('lists only one service\'s routes through service_routes when ?service= is given', async () => {
    connect()
    const calls = fakeKong()

    const wrapper = await mountView('?service=svc-1')

    expect(calls.some((c) => c.url === 'http://kong:8001/services/svc-1/routes')).toBe(true)
    expect(rows(wrapper)).toHaveLength(1)
    expect(byId(wrapper, 'service-filter').attributes('data-value')).toBe('svc-1')
  })

  it('on DB-less Kong shows the notice and disables every write control', async () => {
    connect('off')
    fakeKong()
    const wrapper = await mountView()

    expect(byId(wrapper, 'live-read-only').exists()).toBe(true)
    expect(byId(wrapper, 'new-route').attributes('disabled')).toBeDefined()
    await rows(wrapper)[0].trigger('click')
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()
    expect(byId(wrapper, 'delete').attributes('disabled')).toBeDefined()
    expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
  })

  it('edits a route and saves it with a PATCH to the plain route endpoint', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView('?service=svc-1')

    await rows(wrapper)[0].trigger('click')
    expect(valueOf(wrapper, 'route-name')).toBe('billing-route')
    expect(byId(wrapper, 'route-service').attributes('data-value')).toBe('svc-1')

    await byId(wrapper, 'route-name').setValue('renamed')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toBe('http://kong:8001/routes/r-1')
    expect(patch.body).toMatchObject({ name: 'renamed', protocols: ['http'], paths: ['/billing'], service: { id: 'svc-1' } })
  })

  it('creates a route with a POST to /routes, never sending null values', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await byId(wrapper, 'new-route').trigger('click')
    await byId(wrapper, 'route-name').setValue('fresh')
    await wrapper.findAll('button[aria-pressed]').find((b) => b.text() === 'http')!.trigger('click')
    await choose(wrapper, 'route-service', 'svc-2')
    const pathInput = wrapper.find('[data-testid="route-paths"] input[placeholder*="Add path"]')
    await pathInput.setValue('/fresh')
    await pathInput.trigger('keydown', { key: 'Enter' })
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toBe('http://kong:8001/routes')
    expect(post.body).toMatchObject({ name: 'fresh', protocols: ['http'], paths: ['/fresh'], service: { id: 'svc-2' } })
    expect(Object.values(post.body!).includes(null)).toBe(false)
    expect(rows(wrapper)[0].text()).toContain('fresh')
  })

  it('preselects the filtered service for a new route', async () => {
    connect()
    fakeKong()
    const wrapper = await mountView('?service=svc-1')

    await byId(wrapper, 'new-route').trigger('click')

    expect(byId(wrapper, 'route-service').attributes('data-value')).toBe('svc-1')
  })

  it('blocks Save with the Primate message when no protocol is selected', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await byId(wrapper, 'new-route').trigger('click')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Please check at least one protocol from the list.')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('blocks Save when a selected protocol has none of its required fields', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await byId(wrapper, 'new-route').trigger('click')
    await wrapper.findAll('button[aria-pressed]').find((b) => b.text() === 'tcp')!.trigger('click')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain(
      'At least one of sources, destinations is required, if TCP is selected.',
    )
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('shows Kong field errors in the banner and keeps the form open', async () => {
    connect()
    fakeKong({ status: 400, body: { message: 'schema violation (paths: invalid)', fields: { paths: 'invalid' } } })
    const wrapper = await mountView()

    await byId(wrapper, 'new-route').trigger('click')
    await wrapper.findAll('button[aria-pressed]').find((b) => b.text() === 'http')!.trigger('click')
    const pathInput = wrapper.find('[data-testid="route-paths"] input[placeholder*="Add path"]')
    await pathInput.setValue('nope')
    await pathInput.trigger('keydown', { key: 'Enter' })
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('schema violation (paths: invalid)')
    expect(byId(wrapper, 'save').exists()).toBe(true)
  })

  it('deletes the selected route after confirmation, and not when cancelled', async () => {
    connect()
    const calls = fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    await rows(wrapper)[0].trigger('click')
    await byId(wrapper, 'delete').trigger('click')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)

    confirm.mockReturnValue(true)
    await byId(wrapper, 'delete').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('http://kong:8001/routes/r-1')
    expect(rows(wrapper)).toHaveLength(1)
  })

  it('asks before discarding edits on selection change and on Discard, keeping them on cancel', async () => {
    connect()
    fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    await rows(wrapper)[0].trigger('click')
    await byId(wrapper, 'route-name').setValue('edited')
    await rows(wrapper)[1].trigger('click')
    expect(confirm).toHaveBeenCalled()
    expect(valueOf(wrapper, 'route-name')).toBe('edited')

    await byId(wrapper, 'discard').trigger('click')
    expect(valueOf(wrapper, 'route-name')).toBe('edited')

    confirm.mockReturnValue(true)
    await byId(wrapper, 'discard').trigger('click')
    expect(valueOf(wrapper, 'route-name')).toBe('billing-route')
  })

  it('asks before leaving the page with unsaved edits, and stays when cancelled', async () => {
    connect()
    fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>home</div>' } },
        { path: '/live/routes', component: LiveRoutesView },
      ],
    })
    router.push('/live/routes')
    await router.isReady()
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="route-row"]')[0].trigger('click')
    await wrapper.find('[data-testid="route-name"]').setValue('edited')
    await router.push('/')
    expect(confirm).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/live/routes')

    confirm.mockReturnValue(true)
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('leaves the page without asking when there are no unsaved edits', async () => {
    connect()
    fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>home</div>' } },
        { path: '/live/routes', component: LiveRoutesView },
      ],
    })
    router.push('/live/routes')
    await router.isReady()
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="route-row"]')[0].trigger('click')
    await router.push('/')

    expect(confirm).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/')
  })
})
