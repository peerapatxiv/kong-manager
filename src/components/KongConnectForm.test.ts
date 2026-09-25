// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import KongConnectForm from './KongConnectForm.vue'

function findConnectButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find((b) => b.text().startsWith('Connect'))!
}

describe('KongConnectForm', () => {
  it('emits connect with the entered base URL and token', async () => {
    const wrapper = mount(KongConnectForm, { props: { connecting: false } })

    await wrapper.find('input[placeholder="http://localhost:8001"]').setValue('http://localhost:8001')
    await wrapper.find('input[type="password"]').setValue('secret-token')
    await findConnectButton(wrapper).trigger('click')

    expect(wrapper.emitted('connect')).toEqual([[{ baseUrl: 'http://localhost:8001', token: 'secret-token' }]])
  })

  it('trims the base URL and emits an undefined token when the token field is left blank', async () => {
    const wrapper = mount(KongConnectForm, { props: { connecting: false } })

    await wrapper.find('input[placeholder="http://localhost:8001"]').setValue('  http://localhost:8001  ')
    await findConnectButton(wrapper).trigger('click')

    expect(wrapper.emitted('connect')).toEqual([[{ baseUrl: 'http://localhost:8001', token: undefined }]])
  })

  it('does not emit when the base URL is blank or whitespace-only', async () => {
    const wrapper = mount(KongConnectForm, { props: { connecting: false } })

    await wrapper.find('input[placeholder="http://localhost:8001"]').setValue('   ')
    await findConnectButton(wrapper).trigger('click')

    expect(wrapper.emitted('connect')).toBeUndefined()
  })

  it('disables the Connect button while connecting is true', () => {
    const wrapper = mount(KongConnectForm, { props: { connecting: true } })
    expect((findConnectButton(wrapper).element as HTMLButtonElement).disabled).toBe(true)
  })
})
