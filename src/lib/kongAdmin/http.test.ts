import { describe, it, expect, vi, afterEach } from 'vitest'
import { adminFetch, adminJson, KongAdminApiError } from './http'

const conn = { baseUrl: 'http://localhost:8001' }

function okResponse(body: unknown = {}) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('adminFetch', () => {
  it('joins base URL and path with a single slash and omits null/undefined query values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await adminFetch({ baseUrl: 'http://localhost:8001/' }, 'GET', '/services', {
      query: { size: 10, offset: null, tags: undefined, q: 'a b' },
    })

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8001/services?size=10&q=a+b')
  })

  it('keeps a path prefix on the base URL and still uses exactly one slash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await adminFetch({ baseUrl: 'http://host/kong-admin//' }, 'GET', '/services')

    expect(fetchMock.mock.calls[0][0]).toBe('http://host/kong-admin/services')
  })

  it('sends no query string when there are no query values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await adminFetch(conn, 'GET', '/services', { query: { offset: undefined } })

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8001/services')
  })

  it('sends token and Basic auth headers together, and neither when auth is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await adminFetch(
      { baseUrl: conn.baseUrl, auth: { token: 't0k', username: 'admin', password: 'hunter2' } },
      'GET',
      '/',
    )
    const withAuth = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(withAuth['Kong-Admin-Token']).toBe('t0k')
    expect(withAuth['Authorization']).toBe(`Basic ${btoa('admin:hunter2')}`)

    await adminFetch(conn, 'GET', '/')
    const without = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>
    expect(without['Kong-Admin-Token']).toBeUndefined()
    expect(without['Authorization']).toBeUndefined()
    expect(without['Content-Type']).toBe('application/json')
  })

  it('sends the method and a JSON-stringified body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await adminFetch(conn, 'POST', '/services', { body: { name: 'svc', host: 'h' } })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'svc', host: 'h' })
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [404, 'notFound'],
    [409, 'conflict'],
    [400, 'validation'],
    [500, 'server'],
    [502, 'server'],
  ])('maps HTTP %i to kind %s and keeps the status and message format', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, text: async () => 'nope' }))

    const err = await adminFetch(conn, 'GET', '/x').catch((e) => e)

    expect(err).toBeInstanceOf(KongAdminApiError)
    expect(err.kind).toBe(kind)
    expect(err.status).toBe(status)
    expect(err.message).toBe(`Kong Admin API responded ${status}: nope`)
  })

  it("parses Kong's JSON error body into kongMessage and fields", async () => {
    const body = JSON.stringify({
      name: 'schema violation',
      code: 2,
      message: 'schema violation (host: required field missing)',
      fields: { host: 'required field missing' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => body }))

    const err = await adminFetch(conn, 'POST', '/services').catch((e) => e)

    expect(err.kongMessage).toBe('schema violation (host: required field missing)')
    expect(err.fields).toEqual({ host: 'required field missing' })
  })

  it('still raises KongAdminApiError when the error body is not JSON (HTML from a proxy)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => '<html>Bad Gateway</html>' }),
    )

    const err = await adminFetch(conn, 'GET', '/services').catch((e) => e)

    expect(err).toBeInstanceOf(KongAdminApiError)
    expect(err.status).toBe(502)
    expect(err.kongMessage).toBeUndefined()
    expect(err.fields).toBeUndefined()
    expect(err.message).toContain('502')
  })

  it('raises a network-kind error with status 0 when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const err = await adminFetch(conn, 'GET', '/').catch((e) => e)

    expect(err).toBeInstanceOf(KongAdminApiError)
    expect(err.kind).toBe('network')
    expect(err.status).toBe(0)
    expect(err.message).toBe('network down')
  })

  it('aborts after 20 seconds and reports a timeout as a network error', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      ),
    )

    const assertion = expect(adminFetch(conn, 'GET', '/')).rejects.toMatchObject({
      kind: 'network',
      status: 0,
      message: expect.stringMatching(/timed out/i),
    })
    await vi.advanceTimersByTimeAsync(20000)
    await assertion
  })
})

describe('adminJson', () => {
  it('returns the parsed JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ version: '3.4.1' })))

    await expect(adminJson<{ version: string }>(conn, 'GET', '/')).resolves.toEqual({ version: '3.4.1' })
  })
})
