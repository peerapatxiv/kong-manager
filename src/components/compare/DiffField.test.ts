// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DiffField from './DiffField.vue'

describe('DiffField', () => {
  it('masks a plain changed secret field (both sides strings) by default, with a reveal toggle', async () => {
    const wrapper = mount(DiffField, { props: { path: 'key', before: 'old-secret', after: 'new-secret' } })
    expect(wrapper.text()).not.toContain('old-secret')
    expect(wrapper.text()).not.toContain('new-secret')

    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('old-secret')
    expect(wrapper.text()).toContain('new-secret')
  })

  it('masks a whole-array change on a credentials list (before/after are arrays, not strings)', () => {
    const wrapper = mount(DiffField, {
      props: {
        path: 'keyauth_credentials',
        before: [{ key: 'abc' }],
        after: [{ key: 'abc' }, { key: 'BRAND-NEW-SECRET' }],
      },
    })
    expect(wrapper.text()).not.toContain('BRAND-NEW-SECRET')
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('masks a newly-added secret field whose "before" is undefined, not a string', () => {
    const wrapper = mount(DiffField, {
      props: { path: 'basicauth_credentials[0].password', before: undefined, after: 'HASH-LEAKED-HERE' },
    })
    expect(wrapper.text()).not.toContain('HASH-LEAKED-HERE')
  })

  it('does not mask an ordinary (non-secret) field', () => {
    const wrapper = mount(DiffField, { props: { path: 'host', before: 'a.internal', after: 'b.internal' } })
    expect(wrapper.text()).toContain('a.internal')
    expect(wrapper.text()).toContain('b.internal')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
