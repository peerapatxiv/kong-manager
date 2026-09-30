// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import KongConnectForm from './KongConnectForm.vue'

type Wrapper = ReturnType<typeof mount>

const byId = (wrapper: Wrapper, id: string) => wrapper.find(`[data-testid="${id}"]`)
const connectButton = (wrapper: Wrapper) => wrapper.findAll('button').find((b) => b.text().startsWith('Connect'))!
const isDisabled = (el: { element: Element }) => (el.element as HTMLButtonElement).disabled

function mountForm(connecting = false) {
  return mount(KongConnectForm, { props: { connecting } })
}

describe('KongConnectForm', () => {
  it('emits connect with the composed URL, credentials and name', async () => {
    const wrapper = mountForm()

    await byId(wrapper, 'host').setValue('localhost:8001')
    await byId(wrapper, 'username').setValue('admin')
    await wrapper.find('input[type="password"]').setValue('hunter2')
    await byId(wrapper, 'connection-name').setValue('  Staging  ')
    await connectButton(wrapper).trigger('click')

    expect(wrapper.emitted('connect')).toEqual([
      [
        {
          baseUrl: 'http://localhost:8001',
          auth: { username: 'admin', password: 'hunter2' },
          name: 'Staging',
        },
      ],
    ])
  })

  it('uses the selected protocol and no name or credentials when left blank', async () => {
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

  it('does not emit, and disables Connect, when the host is blank or whitespace-only', async () => {
    const wrapper = mountForm()

    await byId(wrapper, 'host').setValue('   ')
    await connectButton(wrapper).trigger('click')
    await byId(wrapper, 'host').trigger('keyup', { key: 'Enter' })

    expect(wrapper.emitted('connect')).toBeUndefined()
    expect(isDisabled(connectButton(wrapper))).toBe(true)
  })

  it('disables Connect while connecting is true', async () => {
    const wrapper = mountForm(true)
    await byId(wrapper, 'host').setValue('localhost:8001')

    expect(isDisabled(connectButton(wrapper))).toBe(true)
  })

  it('puts the local-storage footnote and the Connect button on one footer row', () => {
    const wrapper = mountForm()

    const footer = byId(wrapper, 'connect-footer')
    expect(footer.text()).toContain('All the above information is stored locally.')
    expect(footer.findAll('button').map((b) => b.text())).toEqual(['Connect'])
  })

  it('styles the protocol dropdown as a distinct prefix of the address field', () => {
    const wrapper = mountForm()

    expect(byId(wrapper, 'protocol').classes()).toContain('bg-elevated/60')
  })

  it('has no Connect automatically checkbox, and never sends an automatic flag', async () => {
    const wrapper = mountForm()

    expect(byId(wrapper, 'auto-connect').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Connect automatically')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)

    await byId(wrapper, 'host').setValue('localhost:8001')
    await connectButton(wrapper).trigger('click')
    expect(wrapper.emitted('connect')?.[0][0]).not.toHaveProperty('autoConnect')
  })

  it('has no Test button, test result or colour picker', () => {
    const wrapper = mountForm()

    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Test')
    expect(byId(wrapper, 'test-connection').exists()).toBe(false)
    expect(byId(wrapper, 'connection-color').exists()).toBe(false)
    expect(wrapper.find('input[type="color"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Colour')
  })

  it('never includes a colour in the connect payload', async () => {
    const wrapper = mountForm()

    await byId(wrapper, 'host').setValue('localhost:8001')
    await connectButton(wrapper).trigger('click')

    expect(wrapper.emitted('connect')?.[0][0]).not.toHaveProperty('colorCode')
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
