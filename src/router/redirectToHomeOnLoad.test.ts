import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { redirectToHomeOnLoad } from './redirectToHomeOnLoad'

function makeRouter(startAt: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/browse', '/live/plugins', '/live/services'].map((path) => ({ path, component: { template: '<div />' } })),
  })
  redirectToHomeOnLoad(router)
  void router.push(startAt)
  return router
}

describe('redirectToHomeOnLoad', () => {
  it('sends a page load that opens on a deep link to the home page', async () => {
    const router = makeRouter('/live/plugins')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('also drops the query of that deep link', async () => {
    const router = makeRouter('/live/services?service=abc')
    await router.isReady()
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('leaves a page load that already opens on the home page alone', async () => {
    const router = makeRouter('/')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('does not interfere with navigation inside the app after the first load', async () => {
    const router = makeRouter('/')
    await router.isReady()
    await router.push('/live/plugins')
    expect(router.currentRoute.value.path).toBe('/live/plugins')
    await router.push('/browse')
    expect(router.currentRoute.value.path).toBe('/browse')
  })

  it('replaces the entry instead of adding one, so Back does not bounce to the deep link', async () => {
    const router = makeRouter('/browse')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/')
    expect(router.options.history.state.back ?? null).toBeNull()
  })
})
