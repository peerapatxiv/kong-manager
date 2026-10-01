// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import AppSelect from './AppSelect.vue'

const OPTIONS = [
  { value: 'a', label: 'Alpha service' },
  { value: 'b', label: 'Beta service' },
  { value: 'c', label: 'Gamma gateway' },
]

let wrapper: VueWrapper | undefined
afterEach(() => wrapper?.unmount())

function make(props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}) {
  wrapper = mount(AppSelect, { props: { modelValue: 'a', options: OPTIONS, ...props }, attrs, attachTo: document.body })
  return wrapper
}
const trigger = () => wrapper!.find('button[role="combobox"]')
const optionTexts = () => wrapper!.findAll('[role="option"]').map((o) => o.text())

describe('AppSelect', () => {
  it('shows the selected option, or the placeholder when nothing matches an empty value', () => {
    expect(make().find('button').text()).toContain('Alpha service')
    wrapper!.unmount()
    expect(make({ modelValue: '', placeholder: 'Pick one' }).find('button').text()).toContain('Pick one')
  })

  it('shows the raw value when it is not among the options, so nothing is silently hidden', () => {
    expect(make({ modelValue: 'zzz' }).find('button').text()).toContain('zzz')
  })

  it('exposes the current value for tests and styling hooks', () => {
    expect(make({}, { 'data-testid': 'pick' }).attributes('data-value')).toBe('a')
  })

  it('opens on click, lists every option, and marks the selected one', async () => {
    make()
    expect(wrapper!.find('[role="listbox"]').exists()).toBe(false)
    await trigger().trigger('click')
    expect(optionTexts()).toEqual(['Alpha service', 'Beta service', 'Gamma gateway'])
    expect(wrapper!.findAll('[role="option"]')[0].attributes('aria-selected')).toBe('true')
    expect(trigger().attributes('aria-expanded')).toBe('true')
  })

  it('emits the chosen value, keeps its type, and closes', async () => {
    make({ modelValue: 301, options: [{ value: 301, label: '301' }, { value: 302, label: '302' }] })
    await trigger().trigger('click')
    await wrapper!.findAll('[role="option"]')[1].trigger('click')
    expect(wrapper!.emitted('update:modelValue')?.[0]).toEqual([302])
    expect(wrapper!.find('[role="listbox"]').exists()).toBe(false)
  })

  it('filters a searchable list as you type and says so when nothing matches', async () => {
    make({ searchable: true })
    await trigger().trigger('click')
    const search = wrapper!.find('input[type="text"]')
    await search.setValue('gate')
    expect(optionTexts()).toEqual(['Gamma gateway'])
    await search.setValue('nope')
    expect(optionTexts()).toEqual([])
    expect(wrapper!.text()).toContain('No matches')
  })

  it('does not show a search box unless asked', async () => {
    make()
    await trigger().trigger('click')
    expect(wrapper!.find('input[type="text"]').exists()).toBe(false)
  })

  it('moves with the arrow keys, picks with Enter and closes with Escape', async () => {
    make()
    await trigger().trigger('keydown', { key: 'ArrowDown' }) // opens on the selected option
    await wrapper!.find('[role="listbox"]').trigger('keydown', { key: 'ArrowDown' })
    await wrapper!.find('[role="listbox"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper!.emitted('update:modelValue')?.[0]).toEqual(['b'])

    await trigger().trigger('click')
    await wrapper!.find('[role="listbox"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper!.find('[role="listbox"]').exists()).toBe(false)
  })

  it('stays on the first and last option instead of wrapping past the ends', async () => {
    make()
    await trigger().trigger('click')
    const list = wrapper!.find('[role="listbox"]')
    await list.trigger('keydown', { key: 'ArrowUp' })
    await list.trigger('keydown', { key: 'Enter' })
    expect(wrapper!.emitted('update:modelValue')?.[0]).toEqual(['a'])
  })

  it('closes when the user clicks elsewhere on the page', async () => {
    make()
    await trigger().trigger('click')
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper!.vm.$nextTick()
    expect(wrapper!.find('[role="listbox"]').exists()).toBe(false)
  })

  it('cannot be opened while disabled', async () => {
    make({ disabled: true })
    await trigger().trigger('click')
    expect(wrapper!.find('[role="listbox"]').exists()).toBe(false)
    expect(trigger().attributes('disabled')).toBeDefined()
  })

  it('copes with a few hundred options', async () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ value: `v${i}`, label: `service-${i}` }))
    make({ options: many, modelValue: 'v299' })
    await trigger().trigger('click')
    expect(wrapper!.findAll('[role="option"]')).toHaveLength(300)
  })
})
