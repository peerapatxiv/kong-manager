// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { router } from './index'

const byPath = (path: string) => router.getRoutes().find((route) => route.path === path)

describe('route table', () => {
  it.each(['services', 'routes', 'consumers', 'plugins'])('has a file page for %s', (page) => {
    expect(byPath(`/file/${page}`)?.name).toBe(`file-${page}`)
  })

  it('sends the old Browse address to the file Services page', () => {
    expect(byPath('/browse')?.redirect).toBe('/file/services')
  })

  it('has no separate file dashboard page, since the Overview page shows it', () => {
    expect(byPath('/file/dashboard')).toBeUndefined()
  })

  it('keeps Overview, Compare and the live pages', () => {
    expect(byPath('/')?.name).toBe('load')
    expect(byPath('/compare')?.name).toBe('compare')
    for (const page of ['services', 'routes', 'consumers', 'plugins']) expect(byPath(`/live/${page}`)).toBeTruthy()
  })
})
