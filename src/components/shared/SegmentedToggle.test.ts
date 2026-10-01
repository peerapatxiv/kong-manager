// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SegmentedToggle from './SegmentedToggle.vue'

const OPTIONS = [
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
]

function make(modelValue = 'http', attrs: Record<string, unknown> = {}) {
  return mount(SegmentedToggle, { props: { modelValue, options: OPTIONS, ariaLabel: 'Protocol' }, attrs })
}

describe('SegmentedToggle', () => {
  it('shows every option side by side and marks only the current one as checked', () => {
    const wrapper = make('https')
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios.map((r) => r.text())).toEqual(['HTTP', 'HTTPS'])
    expect(radios.map((r) => r.attributes('aria-checked'))).toEqual(['false', 'true'])
    expect(wrapper.attributes('role')).toBe('radiogroup')
    expect(wrapper.attributes('aria-label')).toBe('Protocol')
  })

  it('exposes the current value, and each option value, as data attributes', () => {
    const wrapper = make('http', { 'data-testid': 'protocol' })
    expect(wrapper.attributes('data-value')).toBe('http')
    expect(wrapper.findAll('[role="radio"]').map((r) => r.attributes('data-value'))).toEqual(['http', 'https'])
  })

  it('emits the clicked option, and nothing when the current one is clicked again', async () => {
    const wrapper = make('http')
    await wrapper.findAll('[role="radio"]')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['https']])
    await wrapper.findAll('[role="radio"]')[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })

  it('moves with the arrow keys, stopping at the ends', async () => {
    const wrapper = make('http')
    await wrapper.findAll('[role="radio"]')[0].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['https'])
    await wrapper.findAll('[role="radio"]')[0].trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })

  it('only the checked option is in the tab order', () => {
    const wrapper = make('https')
    expect(wrapper.findAll('[role="radio"]').map((r) => r.attributes('tabindex'))).toEqual(['-1', '0'])
  })

  it('cannot be changed while disabled', async () => {
    const wrapper = mount(SegmentedToggle, { props: { modelValue: 'http', options: OPTIONS, disabled: true } })
    await wrapper.findAll('[role="radio"]')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
