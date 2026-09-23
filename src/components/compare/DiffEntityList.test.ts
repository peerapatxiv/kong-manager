// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DiffEntityList from './DiffEntityList.vue'
import type { EntityDiff } from '../../lib/diff'

describe('DiffEntityList — Unmatched bucket', () => {
  it('redacts secret fields instead of dumping unmatched entities raw', () => {
    const diff: EntityDiff<Record<string, unknown>> = {
      added: [],
      removed: [],
      changed: [],
      unmatchedA: [{ custom_id: 'no-username-here', keyauth_credentials: [{ key: 'SUPER-SECRET-A' }] }],
      unmatchedB: [{ custom_id: 'also-no-username', keyauth_credentials: [{ key: 'SUPER-SECRET-B' }] }],
    }

    const wrapper = mount(DiffEntityList, {
      props: { title: 'Consumers', diff, entityLabel: () => '' },
    })

    expect(wrapper.text()).not.toContain('SUPER-SECRET-A')
    expect(wrapper.text()).not.toContain('SUPER-SECRET-B')
    expect(wrapper.text()).toContain('no-username-here')
    expect(wrapper.text()).toContain('also-no-username')
  })
})
