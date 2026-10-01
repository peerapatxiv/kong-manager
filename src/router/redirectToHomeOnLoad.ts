import type { Router } from 'vue-router'

/**
 * Every full page load (opening the app or refreshing the browser) starts on the home page.
 * The live connection only exists in memory, so a refresh on a deep link such as /live/plugins
 * would otherwise land on a "connect first" prompt instead of somewhere useful. Only the very
 * first navigation is redirected; moving around inside the app is left alone.
 */
export function redirectToHomeOnLoad(router: Router): void {
  let firstNavigation = true
  router.beforeEach((to) => {
    if (!firstNavigation) return true
    firstNavigation = false
    return to.fullPath === '/' ? true : { path: '/', replace: true }
  })
}
