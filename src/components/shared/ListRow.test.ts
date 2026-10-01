// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ListRow from './ListRow.vue'

describe('ListRow', () => {
  it('shows the accent bar and green text only when selected', async () => {
    const wrapper = mount(ListRow, { slots: { default: 'alpha' } })
    expect(wrapper.classes()).toContain('border-transparent')

    await wrapper.setProps({ selected: true })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['border-accent', 'text-link']))
  })

  it('passes click, title and data-testid through to the row', async () => {
    const onClick = vi.fn()
    const wrapper = mount(ListRow, {
      attrs: { title: 'alpha', 'data-testid': 'row', onClick },
      slots: { default: 'alpha' },
    })
    expect(wrapper.element.tagName).toBe('LI')
    expect(wrapper.attributes('data-testid')).toBe('row')
    expect(wrapper.attributes('title')).toBe('alpha')
    await wrapper.trigger('click')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows the check only when asked and selected, and an initial avatar when given one', () => {
    const plain = mount(ListRow, { props: { selected: true }, slots: { default: 'a' } })
    expect(plain.find('svg').exists()).toBe(false)

    const checked = mount(ListRow, { props: { selected: true, showCheck: true }, slots: { default: 'a' } })
    expect(checked.find('svg').exists()).toBe(true)

    const avatar = mount(ListRow, { props: { initial: 'k' }, slots: { default: 'kong' } })
    expect(avatar.text()).toContain('k')
    expect(avatar.text()).toContain('kong')
  })

  it('truncates a long label instead of overflowing', () => {
    const wrapper = mount(ListRow, { slots: { default: 'x'.repeat(200) } })
    expect(wrapper.find('span.truncate').exists()).toBe(true)
  })
})
