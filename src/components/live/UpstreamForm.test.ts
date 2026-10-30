// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UpstreamForm from './UpstreamForm.vue'
import { newUpstreamForm } from '../../lib/live/upstreamForm'

describe('UpstreamForm', () => {
  it('emits the whole form with the changed field', async () => {
    const wrapper = mount(UpstreamForm, { props: { modelValue: newUpstreamForm() } })
    await wrapper.find('[data-testid="upstream-name"]').setValue('billing')

    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted[0][0]).toMatchObject({ name: 'billing', algorithm: 'round-robin', slots: 10000 })
  })

  it('emits a number for slots and an empty string when it is cleared', async () => {
    const wrapper = mount(UpstreamForm, { props: { modelValue: newUpstreamForm() } })
    await wrapper.find('[data-testid="upstream-slots"]').setValue('500')
    await wrapper.find('[data-testid="upstream-slots"]').setValue('')

    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted[0][0]).toMatchObject({ slots: 500 })
    expect(emitted[1][0]).toMatchObject({ slots: '' })
  })

  it('shows the field error Kong returned under the field', () => {
    const wrapper = mount(UpstreamForm, { props: { modelValue: newUpstreamForm(), fieldErrors: { name: 'already in use' } } })
    expect(wrapper.text()).toContain('already in use')
  })

  it('disables every field when disabled', () => {
    const wrapper = mount(UpstreamForm, { props: { modelValue: newUpstreamForm(), disabled: true } })
    expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
  })
})
