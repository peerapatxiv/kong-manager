// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import LiveConsumersView from './LiveConsumersView.vue'
import { useConnectionStore } from '../../stores/connection'

type Call = { method: string; url: string; body?: Record<string, unknown> }
type Reply = { ok: boolean; status: number; json?: () => Promise<unknown>; text: () => Promise<string> }

const CONSUMERS = [
  { id: 'c-1', username: 'alice', custom_id: null, tags: ['vip'] },
  { id: 'c-2', username: null, custom_id: 'ext-2', tags: [] },
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
      if (method === 'GET' && url.includes('/consumers/')) return reply({ data: [] })
      if (method === 'GET' && url.includes('/consumers')) return reply({ data: CONSUMERS })
      if (method === 'POST') {
        if (failCreateWith) return reply(failCreateWith.body, failCreateWith.status)
        return reply({ id: 'new-1', ...body }, 201)
      }
      if (method === 'PATCH') return reply({ ...CONSUMERS.find((c) => url.endsWith(`/consumers/${c.id}`)), ...body })
      if (method === 'DELETE') return { ok: true, status: 204, text: async () => '' }
      return reply({}, 404)
    }),
  )
  return calls
}

function connect(database = 'postgres') {
  useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database } })
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/live/consumers', component: LiveConsumersView },
    ],
  })
}

async function mountView() {
  const router = makeRouter()
  const wrapper = mount(LiveConsumersView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountView>>
const byId = (wrapper: Wrapper, id: string) => wrapper.find(`[data-testid="${id}"]`)
const rows = (wrapper: Wrapper) => wrapper.findAll('[data-testid="consumer-row"]')
const valueOf = (wrapper: Wrapper, id: string) => (byId(wrapper, id).element as HTMLInputElement).value

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LiveConsumersView', () => {
  it('shows the connect prompt and sends no request when not connected', async () => {
    const calls = fakeKong()

    const wrapper = await mountView()

    expect(byId(wrapper, 'live-not-connected').exists()).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('lists consumers labelled by username, else custom ID, and filters the loaded ones by search', async () => {
    connect()
    fakeKong()

    const wrapper = await mountView()

    expect(rows(wrapper).map((r) => r.text())).toEqual([expect.stringContaining('alice'), expect.stringContaining('ext-2')])
    await wrapper.find('input[placeholder="Search loaded consumers…"]').setValue('ext')
    expect(rows(wrapper)).toHaveLength(1)
    expect(rows(wrapper)[0].text()).toContain('ext-2')
  })

  it('applies the tag filter through the API on Enter', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    const input = byId(wrapper, 'tag-filter')
    await input.setValue('vip, eu')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(calls.at(-1)?.url).toBe('http://kong:8001/consumers?tags=vip%2Ceu')
  })

  it('on DB-less Kong shows the notice and disables every write control', async () => {
    connect('off')
    fakeKong()
    const wrapper = await mountView()

    expect(byId(wrapper, 'live-read-only').exists()).toBe(true)
    expect(byId(wrapper, 'new-consumer').attributes('disabled')).toBeDefined()
    await rows(wrapper)[0].trigger('click')
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()
    expect(byId(wrapper, 'delete').attributes('disabled')).toBeDefined()
    expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
  })

  it('edits a consumer and saves with a PATCH carrying the change', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await rows(wrapper)[0].trigger('click')
    expect(valueOf(wrapper, 'consumer-username')).toBe('alice')
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()

    await byId(wrapper, 'consumer-username').setValue('alice2')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toBe('http://kong:8001/consumers/c-1')
    expect(patch.body).toMatchObject({ username: 'alice2', custom_id: null, tags: ['vip'] })
  })

  it('clearing the username on a consumer that has a custom ID sends null for the username', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await rows(wrapper)[1].trigger('click')
    await byId(wrapper, 'consumer-username').setValue('temp')
    await byId(wrapper, 'consumer-username').setValue('')
    await byId(wrapper, 'consumer-custom-id').setValue('ext-2b')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ username: null, custom_id: 'ext-2b' })
  })

  it('creates a consumer with a POST, never sending null values', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await byId(wrapper, 'new-consumer').trigger('click')
    await byId(wrapper, 'consumer-username').setValue('  bob ')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toBe('http://kong:8001/consumers')
    expect(post.body).toEqual({ username: 'bob', tags: [] })
    expect(rows(wrapper)[0].text()).toContain('bob')
  })

  it('blocks Save with the Primate message when both username and custom ID are blank', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await byId(wrapper, 'new-consumer').trigger('click')
    await byId(wrapper, 'consumer-username').setValue('   ')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Please provide either a username or a custom ID.')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('shows Kong field errors in the banner and keeps the form open', async () => {
    connect()
    fakeKong({ status: 409, body: { message: 'UNIQUE violation detected on username', fields: { username: 'already exists' } } })
    const wrapper = await mountView()

    await byId(wrapper, 'new-consumer').trigger('click')
    await byId(wrapper, 'consumer-username').setValue('alice')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('UNIQUE violation detected on username')
    expect(wrapper.text()).toContain('already exists')
    expect(valueOf(wrapper, 'consumer-username')).toBe('alice')
  })

  it('deletes after confirming that credentials go too, and not when cancelled', async () => {
    connect()
    const calls = fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    await rows(wrapper)[0].trigger('click')
    await byId(wrapper, 'delete').trigger('click')
    expect(confirm).toHaveBeenCalledWith('Delete this consumer? Its credentials are deleted too.')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)

    confirm.mockReturnValue(true)
    await byId(wrapper, 'delete').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('http://kong:8001/consumers/c-1')
    expect(rows(wrapper)).toHaveLength(1)
  })

  it('asks before discarding edits on selection change and on Discard, keeping them on cancel', async () => {
    connect()
    fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    await rows(wrapper)[0].trigger('click')
    await byId(wrapper, 'consumer-username').setValue('edited')
    await rows(wrapper)[1].trigger('click')
    expect(confirm).toHaveBeenCalled()
    expect(valueOf(wrapper, 'consumer-username')).toBe('edited')

    await byId(wrapper, 'discard').trigger('click')
    expect(valueOf(wrapper, 'consumer-username')).toBe('edited')

    confirm.mockReturnValue(true)
    await byId(wrapper, 'discard').trigger('click')
    expect(valueOf(wrapper, 'consumer-username')).toBe('alice')
  })

  it('asks before leaving the page with unsaved edits, and stays when cancelled', async () => {
    connect()
    fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = makeRouter()
    router.push('/live/consumers')
    await router.isReady()
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="consumer-row"]')[0].trigger('click')
    await wrapper.find('[data-testid="consumer-username"]').setValue('edited')
    await router.push('/')
    expect(confirm).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/live/consumers')

    confirm.mockReturnValue(true)
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
  })
})
