// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RouteCountChip from './RouteCountChip.vue'

describe('RouteCountChip', () => {
  it.each([
    [0, 'No routes'],
    [1, '1 route'],
    [2, '2 routes'],
    [17, '17 routes'],
  ])('says %s as "%s"', (count, text) => {
    expect(mount(RouteCountChip, { props: { count } }).text()).toBe(text)
  })

  it('can be found by its test id', () => {
    expect(mount(RouteCountChip, { props: { count: 3 } }).find('[data-testid="route-count"]').exists()).toBe(true)
  })
})
