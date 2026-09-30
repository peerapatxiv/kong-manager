// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SecretField from './SecretField.vue'

const toggle = (wrapper: ReturnType<typeof mount>) => wrapper.find('button')

describe('SecretField', () => {
  it('masks the value by default and shows an icon-only reveal button, not a text link', () => {
    const wrapper = mount(SecretField, { props: { modelValue: 'abc123' } })

    expect(wrapper.find('input').attributes('type')).toBe('password')
    expect(toggle(wrapper).text()).toBe('')
    expect(toggle(wrapper).attributes('aria-label')).toBe('Reveal value')
    expect(toggle(wrapper).attributes('aria-pressed')).toBe('false')
    expect(toggle(wrapper).find('svg').exists()).toBe(true)
  })

  it('reveals the value on click, then hides it again', async () => {
    const wrapper = mount(SecretField, { props: { modelValue: 'abc123' } })

    await toggle(wrapper).trigger('click')
    expect(wrapper.find('input').attributes('type')).toBe('text')
    expect(toggle(wrapper).attributes('aria-label')).toBe('Hide value')
    expect(toggle(wrapper).attributes('aria-pressed')).toBe('true')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('abc123')

    await toggle(wrapper).trigger('click')
    expect(wrapper.find('input').attributes('type')).toBe('password')
    expect(toggle(wrapper).attributes('aria-label')).toBe('Reveal value')
  })

  it('keeps the toggle inside the field so it does not take its own column', () => {
    const wrapper = mount(SecretField, { props: { modelValue: '' } })

    expect(wrapper.find('input').classes()).toContain('pr-10')
    expect(wrapper.element.classList.contains('relative')).toBe(true)
  })

  it('shows masked dots as the placeholder unless a custom one is given', () => {
    expect(mount(SecretField, { props: { modelValue: undefined } }).find('input').attributes('placeholder')).toMatch(/^•+$/)
    expect(
      mount(SecretField, { props: { modelValue: undefined, placeholder: 'Optional' } }).find('input').attributes('placeholder'),
    ).toBe('Optional')
  })

  it('emits the typed value', async () => {
    const wrapper = mount(SecretField, { props: { modelValue: '' } })

    await wrapper.find('input').setValue('hunter2')

    expect(wrapper.emitted('update:modelValue')).toEqual([['hunter2']])
  })
})
