// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import UpstreamTargetsPanel from './UpstreamTargetsPanel.vue'
import { useConnectionStore } from '../../stores/connection'

type Call = { method: string; path: string; body?: Record<string, unknown> }

const HISTORY = [
  { id: 't1', target: 'a.internal:80', weight: 100, created_at: 1 },
  { id: 't2', target: 'a.internal:80', weight: 50, created_at: 2 },
  { id: 't3', target: 'b.internal:80', weight: 100, created_at: 1 },
  { id: 't4', target: 'gone.internal:80', weight: 100, created_at: 1 },
  { id: 't5', target: 'gone.internal:80', weight: 0, created_at: 2 },
]

const reply = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async (): Promise<string> => JSON.stringify(body),
  headers: new Headers(),
})

function fakeKong(options: { healthStatus?: number; postStatus?: number } = {}) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const path = new URL(url).pathname
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
      calls.push({ method, path, body })
      if (method === 'GET' && path === '/upstreams/up-1/targets') return reply({ data: HISTORY })
      if (method === 'GET' && path === '/upstreams/up-1/health') {
        if (options.healthStatus) return reply({ message: 'health unavailable' }, options.healthStatus)
        return reply({
          data: [
            { target: 'a.internal:80', weight: 50, health: 'HEALTHY' },
            { target: 'b.internal:80', weight: 100, health: 'UNHEALTHY' },
          ],
        })
      }
      if (method === 'POST' && path === '/upstreams/up-1/targets') {
        return options.postStatus ? reply({ message: 'already exists' }, options.postStatus) : reply({ id: 'new', ...body }, 201)
      }
      if (method === 'DELETE') return { ok: true, status: 204, text: async (): Promise<string> => '', headers: new Headers() }
      return reply({}, 404)
    }),
  )
  return calls
}

function connect(database = 'postgres') {
  useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.5.0', database } })
}

async function mountPanel() {
  const wrapper = mount(UpstreamTargetsPanel, { props: { upstreamId: 'up-1' } })
  await flushPromises()
  return wrapper
}

const byId = (wrapper: Awaited<ReturnType<typeof mountPanel>>, id: string) => wrapper.find(`[data-testid="${id}"]`)

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('UpstreamTargetsPanel', () => {
  it('shows one row per address with the newest weight and its health, hiding removed targets', async () => {
    fakeKong()
    connect()
    const wrapper = await mountPanel()

    const rows = wrapper.findAll('[data-testid="target-row"]')
    expect(rows.map((row) => row.find('[data-testid="target-address"]').text())).toEqual(['a.internal:80', 'b.internal:80'])
    expect((rows[0].find('[data-testid="target-weight"]').element as HTMLInputElement).value).toBe('50')
    expect(rows.map((row) => row.find('[data-testid="target-health"]').text())).toEqual(['Healthy', 'Unhealthy'])
    expect(byId(wrapper, 'upstream-targets-count').text()).toBe('2')
  })

  it('still lists targets and says there is no health data when the health call fails', async () => {
    fakeKong({ healthStatus: 500 })
    connect()
    const wrapper = await mountPanel()

    expect(wrapper.findAll('[data-testid="target-row"]')).toHaveLength(2)
    expect(byId(wrapper, 'health-error').text()).toContain('No health data')
    expect(wrapper.findAll('[data-testid="target-health"]').map((badge) => badge.text())).toEqual(['–', '–'])
  })

  it('refreshes health on demand', async () => {
    const calls = fakeKong()
    connect()
    const wrapper = await mountPanel()
    const before = calls.filter((call) => call.path.endsWith('/health')).length

    await byId(wrapper, 'health-refresh').trigger('click')
    await flushPromises()

    expect(calls.filter((call) => call.path.endsWith('/health')).length).toBe(before + 1)
  })

  it('adds a target with a POST and reloads the targets and health', async () => {
    const calls = fakeKong()
    connect()
    const wrapper = await mountPanel()

    await byId(wrapper, 'target-add-input').setValue(' c.internal:8080 ')
    await byId(wrapper, 'target-add-weight').setValue('25')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const post = calls.find((call) => call.method === 'POST')!
    expect(post.path).toBe('/upstreams/up-1/targets')
    expect(post.body).toMatchObject({ target: 'c.internal:8080', weight: 25 })
    expect(calls.filter((call) => call.method === 'GET' && call.path.endsWith('/targets')).length).toBe(2)
    expect((byId(wrapper, 'target-add-input').element as HTMLInputElement).value).toBe('')
  })

  it('blocks an invalid target with a message and sends nothing', async () => {
    const calls = fakeKong()
    connect()
    const wrapper = await mountPanel()

    await byId(wrapper, 'target-add-input').setValue('bad target')
    await wrapper.find('form').trigger('submit')

    expect(byId(wrapper, 'target-errors').text()).toContain('host:port')
    expect(calls.some((call) => call.method === 'POST')).toBe(false)
  })

  it('sets a weight by posting the same address with the new weight', async () => {
    const calls = fakeKong()
    connect()
    const wrapper = await mountPanel()
    const row = wrapper.findAll('[data-testid="target-row"]')[1]

    expect(row.find('[data-testid="target-set-weight"]').attributes('disabled')).toBeDefined()
    await row.find('[data-testid="target-weight"]').setValue('75')
    await row.find('[data-testid="target-set-weight"]').trigger('click')
    await flushPromises()

    const post = calls.find((call) => call.method === 'POST')!
    expect(post.body).toEqual({ target: 'b.internal:80', weight: 75 })
  })

  it('shows Kong\'s error and leaves the list alone when setting a weight is refused', async () => {
    fakeKong({ postStatus: 409 })
    connect()
    const wrapper = await mountPanel()
    const row = wrapper.findAll('[data-testid="target-row"]')[1]

    await row.find('[data-testid="target-weight"]').setValue('75')
    await row.find('[data-testid="target-set-weight"]').trigger('click')
    await flushPromises()

    expect(byId(wrapper, 'target-write-error').text()).toContain('already exists')
    expect(wrapper.findAll('[data-testid="target-row"]')).toHaveLength(2)
  })

  it('removes a target by address after confirming', async () => {
    const calls = fakeKong()
    connect()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = await mountPanel()

    await wrapper.findAll('[data-testid="target-delete"]')[0].trigger('click')
    await flushPromises()

    const del = calls.find((call) => call.method === 'DELETE')!
    expect(del.path).toBe('/upstreams/up-1/targets/a.internal%3A80')
  })

  it('does not remove anything when the confirmation is declined', async () => {
    const calls = fakeKong()
    connect()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountPanel()

    await wrapper.findAll('[data-testid="target-delete"]')[0].trigger('click')

    expect(calls.some((call) => call.method === 'DELETE')).toBe(false)
  })

  it('on DB-less Kong shows no add form and disables the row controls', async () => {
    fakeKong()
    connect('off')
    const wrapper = await mountPanel()

    expect(byId(wrapper, 'target-add-input').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="target-delete"]').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })
})
