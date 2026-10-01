// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import AppShell from './AppShell.vue'
import { useConfigStore } from '../../stores/config'

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/compare', '/file/dashboard', '/file/services', '/file/routes', '/file/consumers', '/file/plugins', '/live/plugins'].map((path) => ({
      path,
      component: { template: '<div />' },
    })),
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

  it('has no Push to Kong button, even with a config loaded', async () => {
    const router = testRouter()
    router.push('/')
    await router.isReady()
    useConfigStore().loadPrimary('a.yaml', '_format_version: "3.0"\nservices:\n- name: svc-a\n  host: a.internal\n')

    const wrapper = mount(AppShell, { global: { plugins: [router] }, slots: { default: '<div />' } })

    expect(wrapper.text()).not.toContain('Push to Kong')
    expect(wrapper.text()).toContain('Generate new config')
  })

  it.each([
    ['/file/dashboard', 'File dashboard'],
    ['/file/services', 'File services'],
    ['/file/routes', 'File routes'],
    ['/file/consumers', 'File consumers'],
    ['/file/plugins', 'File plugins'],
    ['/compare', 'Compare'],
    ['/live/plugins', 'Live plugins'],
    ['/', 'Overview'],
  ])('titles %s as "%s"', async (path, title) => {
    const router = testRouter()
    router.push(path)
    await router.isReady()
    const wrapper = mount(AppShell, { global: { plugins: [router] }, slots: { default: '<div />' } })
    expect(wrapper.find('h1').text()).toBe(title)
  })
})
