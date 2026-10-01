import { describe, it, expect } from 'vitest'
import { summarizeRoute } from './routeSummary'

describe('summarizeRoute', () => {
  it('shows the methods and the first path, counting the paths it leaves out', () => {
    expect(summarizeRoute({ methods: ['GET', 'POST'], paths: ['/api/a', '/api/b', '/api/c'] })).toEqual({
      methods: ['GET', 'POST'],
      moreMethods: 0,
      target: '/api/a',
      moreTargets: 2,
    })
  })

  it('shows at most two methods and counts the rest', () => {
    const summary = summarizeRoute({ methods: ['GET', 'POST', 'PUT', 'DELETE'], paths: ['/x'] })
    expect(summary.methods).toEqual(['GET', 'POST'])
    expect(summary.moreMethods).toBe(2)
  })

  it('shows no methods when the route accepts any (Kong stores null)', () => {
    expect(summarizeRoute({ methods: null, paths: ['/x'] }).methods).toEqual([])
    expect(summarizeRoute({ paths: ['/x'] }).methods).toEqual([])
  })

  it('falls back to the first host when there is no path', () => {
    expect(summarizeRoute({ paths: null, hosts: ['api.example.com', 'b.example.com'] })).toMatchObject({
      target: 'api.example.com',
      moreTargets: 1,
    })
  })

  it('gives an empty summary for a route with nothing to match on', () => {
    expect(summarizeRoute({})).toEqual({ methods: [], moreMethods: 0, target: '', moreTargets: 0 })
  })

  it('ignores values that are not lists of strings instead of throwing', () => {
    expect(summarizeRoute({ methods: 'GET', paths: 5, hosts: [null, 7, 'h.example.com'] })).toMatchObject({
      methods: [],
      target: 'h.example.com',
    })
  })
})
