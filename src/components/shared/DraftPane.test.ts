// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DraftPane from './DraftPane.vue'

type Item = { name: string; n: number }

function make(modelValue: Item = { name: 'a', n: 1 }, resetKey = 'one') {
  return mount(DraftPane<Item>, {
    props: { modelValue, resetKey },
    slots: {
      default: `<template #default="{ draft, update }">
        <input data-testid="name" :value="draft.name" @input="update({ ...draft, name: $event.target.value })" />
      </template>`,
    },
  })
}
const input = (w: ReturnType<typeof make>) => w.find('[data-testid="name"]')
const button = (w: ReturnType<typeof make>, label: string) => w.findAll('button').find((b) => b.text() === label)!

afterEach(() => vi.restoreAllMocks())

describe('DraftPane', () => {
  it('shows the entity in the slot and keeps Save and Discard off until something changes', () => {
    const wrapper = make()
    expect((input(wrapper).element as HTMLInputElement).value).toBe('a')
    expect(button(wrapper, 'Save').attributes('disabled')).toBeDefined()
    expect(button(wrapper, 'Discard').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain('Unsaved changes')
  })

  it('notes unsaved changes and emits a copy of the edited entity on Save', async () => {
    const original = { name: 'a', n: 1 }
    const wrapper = make(original)
    await input(wrapper).setValue('b')
    expect(wrapper.text()).toContain('Unsaved changes')

    await button(wrapper, 'Save').trigger('click')

    expect(wrapper.emitted('save')![0][0]).toEqual({ name: 'b', n: 1 })
    expect(original.name).toBe('a')
    expect(wrapper.text()).not.toContain('Unsaved changes')
    expect(wrapper.text()).toContain('Saved')
    expect(button(wrapper, 'Save').attributes('disabled')).toBeDefined()
  })

  it('asks before discarding, restores the saved version, and keeps the edit when cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const wrapper = make()
    await input(wrapper).setValue('b')

    await button(wrapper, 'Discard').trigger('click')
    expect((input(wrapper).element as HTMLInputElement).value).toBe('b')
    await button(wrapper, 'Discard').trigger('click')

    expect(confirm).toHaveBeenCalledWith('Discard your unsaved changes?')
    expect((input(wrapper).element as HTMLInputElement).value).toBe('a')
  })

  it('starts over with the new entity when the reset key changes', async () => {
    const wrapper = make({ name: 'a', n: 1 }, 'one')
    await input(wrapper).setValue('edited')

    await wrapper.setProps({ modelValue: { name: 'z', n: 9 }, resetKey: 'two' })

    expect((input(wrapper).element as HTMLInputElement).value).toBe('z')
    expect(wrapper.text()).not.toContain('Unsaved changes')
  })

  it('does not reset when the same entity comes back after a save', async () => {
    const wrapper = make({ name: 'a', n: 1 }, 'one')
    await input(wrapper).setValue('b')
    await wrapper.setProps({ modelValue: { name: 'b', n: 1 } })
    expect((input(wrapper).element as HTMLInputElement).value).toBe('b')
  })

  it('tells its parent whether there are unsaved changes', async () => {
    const wrapper = make()
    expect((wrapper.vm as unknown as { dirty: boolean }).dirty).toBe(false)
    await input(wrapper).setValue('b')
    expect((wrapper.vm as unknown as { dirty: boolean }).dirty).toBe(true)
  })
})
