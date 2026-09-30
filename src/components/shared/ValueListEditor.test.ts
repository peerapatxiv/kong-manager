// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ValueListEditor from './ValueListEditor.vue'

const last = (w: ReturnType<typeof mount>) => w.emitted('update:modelValue')!.at(-1)![0]

describe('ValueListEditor', () => {
  it('edits a value in place without reordering', async () => {
    const w = mount(ValueListEditor, { props: { modelValue: ['a.com', 'b.com', 'c.com'] } })
    const input = w.findAll('input')[1]
    await input.setValue('b2.com')
    expect(last(w)).toEqual(['a.com', 'b2.com', 'c.com'])
  })

  it('removes a value when cleared or when × is clicked', async () => {
    const w = mount(ValueListEditor, { props: { modelValue: ['a', 'b'] } })
    await w.findAll('input')[0].setValue('  ')
    expect(last(w)).toEqual(['b'])
    await w.findAll('button[title="Remove"]')[1].trigger('click')
    expect(last(w)).toEqual(['a'])
  })

  it('appends from the add row on Enter', async () => {
    const w = mount(ValueListEditor, { props: { modelValue: ['a'] } })
    const add = w.findAll('input')[1]
    await add.setValue(' new ')
    await add.trigger('keydown', { key: 'Enter' })
    expect(last(w)).toEqual(['a', 'new'])
  })
})
