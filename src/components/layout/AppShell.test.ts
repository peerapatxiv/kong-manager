// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import AppShell from './AppShell.vue'

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
}

describe('AppShell', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('fixes the shell to the viewport height so only <main> scrolls, not the whole layout', async () => {
    const router = testRouter()
    router.push('/')
    await router.isReady()

    const wrapper = mount(AppShell, {
      global: { plugins: [router] },
      slots: { default: '<div>page content</div>' },
    })

    const root = wrapper.element as HTMLElement
    expect(root.classList.contains('h-screen')).toBe(true)
    expect(root.classList.contains('min-h-screen')).toBe(false)

    const main = wrapper.find('main')
    expect(main.classes()).toContain('flex-1')
    expect(main.classes()).toContain('overflow-y-auto')
  })
})
