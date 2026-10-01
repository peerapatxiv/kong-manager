// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DraftBar from './DraftBar.vue'

const button = (w: ReturnType<typeof mount>, label: string) => w.findAll('button').find((b) => b.text() === label)!

describe('DraftBar', () => {
  it('keeps Save and Discard off until there is something to save', () => {
    const wrapper = mount(DraftBar, { props: { dirty: false, justSaved: false } })
    expect(button(wrapper, 'Save').attributes('disabled')).toBeDefined()
    expect(button(wrapper, 'Discard').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain('Unsaved changes')
  })

  it('notes unsaved changes and turns the buttons on', () => {
    const wrapper = mount(DraftBar, { props: { dirty: true, justSaved: false } })
    expect(wrapper.text()).toContain('Unsaved changes')
    expect(button(wrapper, 'Save').attributes('disabled')).toBeUndefined()
    expect(button(wrapper, 'Discard').attributes('disabled')).toBeUndefined()
  })

  it('confirms a save for a moment', () => {
    const wrapper = mount(DraftBar, { props: { dirty: false, justSaved: true } })
    expect(wrapper.text()).toContain('Saved')
    expect(wrapper.text()).not.toContain('Unsaved changes')
  })

  it('asks its owner to save or discard', async () => {
    const wrapper = mount(DraftBar, { props: { dirty: true, justSaved: false } })
    await button(wrapper, 'Save').trigger('click')
    await button(wrapper, 'Discard').trigger('click')
    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.emitted('discard')).toHaveLength(1)
  })
})
