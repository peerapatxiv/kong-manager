// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LiveActionBar from './LiveActionBar.vue'

const base = { creating: false, dirty: false, canSave: false, canWrite: true, busy: false }

describe('LiveActionBar', () => {
  it('offers Delete only for an existing entity, and labels Save as Create for a new one', async () => {
    const existing = mount(LiveActionBar, { props: base })
    expect(existing.find('[data-testid="delete"]').exists()).toBe(true)
    expect(existing.find('[data-testid="save"]').text()).toBe('Save')

    const created = mount(LiveActionBar, { props: { ...base, creating: true } })
    expect(created.find('[data-testid="delete"]').exists()).toBe(false)
    expect(created.find('[data-testid="save"]').text()).toBe('Create')
  })

  it('shows "Unsaved changes" only when dirty and enables Discard with it', () => {
    expect(mount(LiveActionBar, { props: base }).text()).not.toContain('Unsaved changes')
    const dirty = mount(LiveActionBar, { props: { ...base, dirty: true } })
    expect(dirty.text()).toContain('Unsaved changes')
    expect(dirty.find('[data-testid="discard"]').attributes('disabled')).toBeUndefined()
  })

  it('disables Save until it is allowed, and Delete when read-only or busy', () => {
    expect(mount(LiveActionBar, { props: base }).find('[data-testid="save"]').attributes('disabled')).toBeDefined()
    expect(
      mount(LiveActionBar, { props: { ...base, canSave: true } }).find('[data-testid="save"]').attributes('disabled'),
    ).toBeUndefined()
    expect(
      mount(LiveActionBar, { props: { ...base, canWrite: false } }).find('[data-testid="delete"]').attributes('disabled'),
    ).toBeDefined()
    expect(
      mount(LiveActionBar, { props: { ...base, busy: true } }).find('[data-testid="delete"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('emits delete, discard and save', async () => {
    const wrapper = mount(LiveActionBar, { props: { ...base, dirty: true, canSave: true } })
    await wrapper.find('[data-testid="delete"]').trigger('click')
    await wrapper.find('[data-testid="discard"]').trigger('click')
    await wrapper.find('[data-testid="save"]').trigger('click')
    expect(wrapper.emitted('delete')).toHaveLength(1)
    expect(wrapper.emitted('discard')).toHaveLength(1)
    expect(wrapper.emitted('save')).toHaveLength(1)
  })
})
