import { describe, it, expect, vi, afterEach } from 'vitest'
import { getConfig, setConfig, KongAdminApiError } from './kongAdminApi'

const EXPANDED_YAML = `_format_version: '3.0'
services:
- id: svc-1
  name: billing-service
  host: billing.internal
routes:
- id: route-1
  name: billing-route
  service: svc-1
  paths:
  - /billing
consumers: []
plugins: []
`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getConfig', () => {
  it('fetches {baseUrl}/config, unwraps the config envelope, and denormalizes it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ config: EXPANDED_YAML }) })
    vi.stubGlobal('fetch', fetchMock)

    const config = await getConfig('http://localhost:8001')

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8001/config')
    expect(config.services).toHaveLength(1)
    expect(config.services![0].routes).toHaveLength(1)
    expect(config.services![0].routes![0].name).toBe('billing-route')
  })

  it('strips a trailing slash from the base URL instead of requesting a double slash', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ config: EXPANDED_YAML }) })
    vi.stubGlobal('fetch', fetchMock)

    await getConfig('http://localhost:8001/')

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8001/config')
  })

  it('attaches the Kong-Admin-Token header when a token is given, and omits it otherwise', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ config: EXPANDED_YAML }) })
    vi.stubGlobal('fetch', fetchMock)

    await getConfig('http://localhost:8001', { token: 'secret-token' })
    const withToken = fetchMock.mock.calls[0][1] as RequestInit
    expect((withToken.headers as Record<string, string>)['Kong-Admin-Token']).toBe('secret-token')

    fetchMock.mockClear()
    await getConfig('http://localhost:8001')
    const withoutToken = fetchMock.mock.calls[0][1] as RequestInit
    expect((withoutToken.headers as Record<string, string>)['Kong-Admin-Token']).toBeUndefined()
  })

  it('attaches a Basic Auth header when a username is given, encoding username:password', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ config: EXPANDED_YAML }) })
    vi.stubGlobal('fetch', fetchMock)

    await getConfig('http://localhost:8001', { username: 'admin', password: 'hunter2' })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Basic ${btoa('admin:hunter2')}`)
  })

  it('sends both the admin token and Basic Auth headers together when both are given', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ config: EXPANDED_YAML }) })
    vi.stubGlobal('fetch', fetchMock)

    await getConfig('http://localhost:8001', { token: 'secret-token', username: 'admin', password: 'hunter2' })

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Kong-Admin-Token']).toBe('secret-token')
    expect(headers['Authorization']).toBe(`Basic ${btoa('admin:hunter2')}`)
  })

  it('omits the Authorization header when neither username nor token is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ config: EXPANDED_YAML }) })
    vi.stubGlobal('fetch', fetchMock)

    await getConfig('http://localhost:8001', {})

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
    expect(headers['Kong-Admin-Token']).toBeUndefined()
  })

  it('throws KongAdminApiError with the status and body on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' }))

    await expect(getConfig('http://localhost:8001')).rejects.toThrow(KongAdminApiError)
    await expect(getConfig('http://localhost:8001')).rejects.toThrow(/401/)
  })

  it('throws KongAdminApiError on a network error instead of an unhandled rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    await expect(getConfig('http://localhost:8001')).rejects.toThrow('network down')
  })
})

describe('setConfig', () => {
  it('POSTs the serialized config wrapped in a config field, as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)

    await setConfig('http://localhost:8001', { _format_version: '3.0', services: [] })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8001/config')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    const body = JSON.parse(init.body as string)
    expect(body.config).toContain('_format_version')
  })

  it('throws KongAdminApiError on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad config' }))

    await expect(setConfig('http://localhost:8001', { _format_version: '3.0' })).rejects.toThrow(/400/)
  })
})
