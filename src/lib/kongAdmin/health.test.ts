import { describe, it, expect, vi, afterEach } from 'vitest'
import { getUpstreamHealth, parseUpstreamHealth } from './health'

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: new Headers(),
})

afterEach(() => vi.unstubAllGlobals())

describe('parseUpstreamHealth', () => {
  it('reads target, weight and health from each row', () => {
    const rows = parseUpstreamHealth({
      data: [
        { target: 'a.internal:80', weight: 100, health: 'HEALTHY', created_at: 1 },
        { target: 'b.internal:80', weight: 50, health: 'UNHEALTHY' },
      ],
    })
    expect(rows).toEqual([
      { target: 'a.internal:80', weight: 100, health: 'HEALTHY' },
      { target: 'b.internal:80', weight: 50, health: 'UNHEALTHY' },
    ])
  })

  it('reads the weight from a { total } object, as newer Kong versions send it', () => {
    const rows = parseUpstreamHealth({ data: [{ target: 'a:80', weight: { total: 70, available: 70, unavailable: 0 }, health: 'HEALTHY' }] })
    expect(rows[0].weight).toBe(70)
  })

  it.each([null, undefined, 'x', 42, {}, { data: 'x' }, { data: null }])('returns [] for a malformed body (%j)', (raw) => {
    expect(parseUpstreamHealth(raw)).toEqual([])
  })

  it('skips rows without a usable target and passes unknown health strings through', () => {
    const rows = parseUpstreamHealth({ data: [null, 'x', { health: 'HEALTHY' }, { target: '' }, { target: 'a:80', health: 'SOMETHING_NEW' }, { target: 'b:80' }] })
    expect(rows).toEqual([
      { target: 'a:80', weight: undefined, health: 'SOMETHING_NEW' },
      { target: 'b:80', weight: undefined, health: undefined },
    ])
  })
})

describe('getUpstreamHealth', () => {
  it('requests the encoded upstream id and parses the rows', async () => {
    const fetchMock = vi.fn(async () => json({ data: [{ target: 'a:80', weight: 100, health: 'HEALTHY' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const rows = await getUpstreamHealth({ baseUrl: 'http://kong:8001' }, 'up 1')

    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('http://kong:8001/upstreams/up%201/health')
    expect(rows).toEqual([{ target: 'a:80', weight: 100, health: 'HEALTHY' }])
  })

  it('rejects when Kong answers with an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'boom' }, 500)))
    await expect(getUpstreamHealth({ baseUrl: 'http://kong:8001' }, 'up-1')).rejects.toThrow()
  })
})
