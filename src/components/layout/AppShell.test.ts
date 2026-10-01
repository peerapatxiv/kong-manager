// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import AppShell from './AppShell.vue'
import { useConfigStore } from '../../stores/config'
import { usePageMetaStore } from '../../stores/pageMeta'

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/compare', '/file/services', '/file/routes', '/file/consumers', '/file/plugins', '/live/plugins'].map((path) => ({
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

  describe('page count', () => {
    const mountShell = async () => {
      const router = testRouter()
      router.push('/live/plugins')
      await router.isReady()
      return mount(AppShell, { global: { plugins: [router] }, slots: { default: '<div />' } })
    }

    it('shows a small number next to the page title when the page has a count', async () => {
      usePageMetaStore().set(159)
      const wrapper = await mountShell()
      expect(wrapper.find('h1').text()).toBe('Live plugins')
      expect(wrapper.find('[data-testid="page-count"]').text()).toBe('159')
    })

    it('adds a plus when only part of the list has loaded', async () => {
      usePageMetaStore().set(100, true)
      expect((await mountShell()).find('[data-testid="page-count"]').text()).toBe('100+')
    })

    it('shows nothing when there is no count, and zero as a number', async () => {
      expect((await mountShell()).find('[data-testid="page-count"]').exists()).toBe(false)
      usePageMetaStore().set(0)
      expect((await mountShell()).find('[data-testid="page-count"]').text()).toBe('0')
    })

    it('updates when the count changes', async () => {
      const wrapper = await mountShell()
      usePageMetaStore().set(3)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="page-count"]').text()).toBe('3')
    })
  })
})
