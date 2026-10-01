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

afterEach(() => vi.restoreAllMocks())

type Exposed = { dirty: boolean; justSaved: boolean; save: () => void; discard: () => void }
const exposed = (w: ReturnType<typeof make>) => w.vm as unknown as Exposed

afterEach(() => vi.restoreAllMocks())

describe('DraftPane', () => {
  it('shows the entity in the slot and draws no buttons of its own', () => {
    const wrapper = make()
    expect((input(wrapper).element as HTMLInputElement).value).toBe('a')
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(exposed(wrapper).dirty).toBe(false)
  })

  it('reports unsaved changes as soon as the draft differs', async () => {
    const wrapper = make()
    await input(wrapper).setValue('b')
    expect(exposed(wrapper).dirty).toBe(true)
  })

  it('emits a copy of the edited entity on save, then counts as saved and clean', async () => {
    const original = { name: 'a', n: 1 }
    const wrapper = make(original)
    await input(wrapper).setValue('b')

    exposed(wrapper).save()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('save')![0][0]).toEqual({ name: 'b', n: 1 })
    expect(original.name).toBe('a')
    expect(exposed(wrapper).dirty).toBe(false)
    expect(exposed(wrapper).justSaved).toBe(true)
  })

  it('asks before discarding, restores the saved version, and keeps the edit when cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const wrapper = make()
    await input(wrapper).setValue('b')

    exposed(wrapper).discard()
    await wrapper.vm.$nextTick()
    expect((input(wrapper).element as HTMLInputElement).value).toBe('b')
    exposed(wrapper).discard()
    await wrapper.vm.$nextTick()

    expect(confirm).toHaveBeenCalledWith('Discard your unsaved changes?')
    expect((input(wrapper).element as HTMLInputElement).value).toBe('a')
  })

  it('starts over with the new entity when the reset key changes', async () => {
    const wrapper = make({ name: 'a', n: 1 }, 'one')
    await input(wrapper).setValue('edited')

    await wrapper.setProps({ modelValue: { name: 'z', n: 9 }, resetKey: 'two' })

    expect((input(wrapper).element as HTMLInputElement).value).toBe('z')
    expect(exposed(wrapper).dirty).toBe(false)
  })

  it('does not reset when the same entity comes back after a save', async () => {
    const wrapper = make({ name: 'a', n: 1 }, 'one')
    await input(wrapper).setValue('b')
    await wrapper.setProps({ modelValue: { name: 'b', n: 1 } })
    expect((input(wrapper).element as HTMLInputElement).value).toBe('b')
  })
})
