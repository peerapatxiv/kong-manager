// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import KongConnectForm from './KongConnectForm.vue'

type Wrapper = ReturnType<typeof mount>

const byId = (wrapper: Wrapper, id: string) => wrapper.find(`[data-testid="${id}"]`)
const connectButton = (wrapper: Wrapper) => wrapper.findAll('button').find((b) => b.text().startsWith('Connect'))!
const isDisabled = (el: { element: Element }) => (el.element as HTMLButtonElement).disabled

function mountForm(connecting = false) {
  return mount(KongConnectForm, { props: { connecting } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KongConnectForm', () => {
  it('emits connect with the composed URL, credentials, name, colour and the automatic flag', async () => {
    const wrapper = mountForm()

    await byId(wrapper, 'host').setValue('localhost:8001')
    await byId(wrapper, 'username').setValue('admin')
    await wrapper.find('input[type="password"]').setValue('hunter2')
    await byId(wrapper, 'connection-name').setValue('  Staging  ')
    await byId(wrapper, 'connection-color').setValue('#ff0000')
    await byId(wrapper, 'auto-connect').setValue(true)
    await connectButton(wrapper).trigger('click')

    expect(wrapper.emitted('connect')).toEqual([
      [
        {
          baseUrl: 'http://localhost:8001',
          auth: { username: 'admin', password: 'hunter2' },
          name: 'Staging',
          colorCode: '#ff0000',
          autoConnect: true,
        },
      ],
    ])
  })

  it('uses the selected protocol, the default colour, and no name or credentials when left blank', async () => {
    const wrapper = mountForm()

    await byId(wrapper, 'protocol').setValue('https')
    await byId(wrapper, 'host').setValue('  kong.internal  ')
    await connectButton(wrapper).trigger('click')

    expect(wrapper.emitted('connect')).toEqual([
      [
        {
          baseUrl: 'https://kong.internal',
          auth: { username: undefined, password: undefined },
          name: undefined,
          colorCode: '#196b13',
          autoConnect: false,
        },
      ],
    ])
  })

  it('splits a pasted full URL into the protocol dropdown and the host field', async () => {
    const wrapper = mountForm()

    await byId(wrapper, 'host').setValue('https://kong.internal:8444/')
    await connectButton(wrapper).trigger('click')

    expect((byId(wrapper, 'protocol').element as HTMLSelectElement).value).toBe('https')
    expect((byId(wrapper, 'host').element as HTMLInputElement).value).toBe('kong.internal:8444/')
    expect(wrapper.emitted('connect')?.[0][0]).toMatchObject({ baseUrl: 'https://kong.internal:8444' })
  })

  it('connects when Enter is pressed in the host field', async () => {
    const wrapper = mountForm()

    await byId(wrapper, 'host').setValue('localhost:8001')
    await byId(wrapper, 'host').trigger('keyup', { key: 'Enter' })

    expect(wrapper.emitted('connect')).toHaveLength(1)
  })

  it('does not emit, and disables Connect and Test, when the host is blank or whitespace-only', async () => {
    const wrapper = mountForm()

    await byId(wrapper, 'host').setValue('   ')
    await connectButton(wrapper).trigger('click')
    await byId(wrapper, 'host').trigger('keyup', { key: 'Enter' })

    expect(wrapper.emitted('connect')).toBeUndefined()
    expect(isDisabled(connectButton(wrapper))).toBe(true)
    expect(isDisabled(byId(wrapper, 'test-connection'))).toBe(true)
  })

  it('disables Connect and Test while connecting is true', async () => {
    const wrapper = mountForm(true)
    await byId(wrapper, 'host').setValue('localhost:8001')

    expect(isDisabled(connectButton(wrapper))).toBe(true)
    expect(isDisabled(byId(wrapper, 'test-connection'))).toBe(true)
  })

  it('shows the Primate-style panel title, the local-storage footnote and Optional credential fields', () => {
    const wrapper = mountForm()

    expect(wrapper.text()).toContain('New Connection')
    expect(wrapper.text()).toContain('All the above information is stored locally.')
    expect(byId(wrapper, 'username').attributes('placeholder')).toBe('Optional')
    expect(wrapper.find('input[type="password"]').attributes('placeholder')).toBe('Optional')
    expect(byId(wrapper, 'host').attributes('placeholder')).toBe('127.0.0.1')
  })
})

describe('KongConnectForm Test button', () => {
  it('probes the Admin API root with the credentials and shows the Kong version and database', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ version: '3.4.1', configuration: { database: 'postgres' } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mountForm()
    await byId(wrapper, 'host').setValue('localhost:8001')
    await byId(wrapper, 'username').setValue('admin')
    await wrapper.find('input[type="password"]').setValue('hunter2')

    await byId(wrapper, 'test-connection').trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8001/')
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Basic ${btoa('admin:hunter2')}`)
    expect(byId(wrapper, 'test-result').text()).toContain('Kong 3.4.1')
    expect(byId(wrapper, 'test-result').text()).toContain('postgres')
    expect(wrapper.emitted('connect')).toBeUndefined()
  })

  it('shows the error message when the probe fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))
    const wrapper = mountForm()
    await byId(wrapper, 'host').setValue('localhost:8001')

    await byId(wrapper, 'test-connection').trigger('click')
    await flushPromises()

    expect(byId(wrapper, 'test-result').text()).toContain('connection refused')
  })

  it('shows Testing… and is disabled while the probe is in flight', async () => {
    let resolve!: (value: unknown) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((r) => (resolve = r))))
    const wrapper = mountForm()
    await byId(wrapper, 'host').setValue('localhost:8001')

    await byId(wrapper, 'test-connection').trigger('click')

    expect(byId(wrapper, 'test-connection').text()).toBe('Testing…')
    expect(isDisabled(byId(wrapper, 'test-connection'))).toBe(true)
    resolve({ ok: true, status: 200, json: async () => ({ version: '3.4.1' }) })
    await flushPromises()
    expect(byId(wrapper, 'test-connection').text()).toBe('Test')
  })

  it('clears a stale test result when the address is edited', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    const wrapper = mountForm()
    await byId(wrapper, 'host').setValue('localhost:8001')
    await byId(wrapper, 'test-connection').trigger('click')
    await flushPromises()
    expect(byId(wrapper, 'test-result').exists()).toBe(true)

    await byId(wrapper, 'host').setValue('localhost:8002')

    expect(byId(wrapper, 'test-result').exists()).toBe(false)
  })
})
