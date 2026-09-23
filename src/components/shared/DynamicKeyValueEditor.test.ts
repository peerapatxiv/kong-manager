// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DynamicKeyValueEditor from './DynamicKeyValueEditor.vue'

describe('DynamicKeyValueEditor', () => {
  it('renders a null value as an empty text input and keeps it null when untouched', () => {
    const wrapper = mount(DynamicKeyValueEditor, {
      props: { modelValue: { custom_fields_by_lua: null } },
    })

    const input = wrapper.find('input[placeholder="null"]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('setting a null field back to empty re-emits null, not an empty string', async () => {
    const wrapper = mount(DynamicKeyValueEditor, {
      props: { modelValue: { note: null } },
    })

    const input = wrapper.find('input[placeholder="null"]')
    await input.setValue('temporary text')
    await input.setValue('')

    const emitted = wrapper.emitted('update:modelValue')!
    const lastEmit = emitted[emitted.length - 1][0] as Record<string, unknown>
    expect(lastEmit.note).toBeNull()
  })

  it('masks secret-like keys and reveals them on toggle', async () => {
    const wrapper = mount(DynamicKeyValueEditor, {
      props: { modelValue: { key: 'abc123key' } },
    })

    const secretInput = wrapper.find('input[type="password"]')
    expect(secretInput.exists()).toBe(true)

    await wrapper.find('button').trigger('click')
    expect(wrapper.find('input[type="text"]').element).toBe(secretInput.element)
  })

  it('recurses into nested objects and object-arrays', () => {
    const wrapper = mount(DynamicKeyValueEditor, {
      props: {
        modelValue: {
          nested: { inner: 'value' },
          rows: [{ a: 1 }],
        },
      },
    })

    expect(wrapper.text()).toContain('inner')
    expect(wrapper.text()).toContain('a')
  })

  it('adds a new key via the add-key control', async () => {
    const wrapper = mount(DynamicKeyValueEditor, {
      props: { modelValue: {} },
    })

    await wrapper.find('input[placeholder="new key…"]').setValue('policy')
    await wrapper.find('button').trigger('click')

    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted[0][0]).toEqual({ policy: '' })
  })
})
