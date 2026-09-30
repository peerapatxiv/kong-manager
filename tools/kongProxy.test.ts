import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { kongProxyMiddleware } from './kongProxy'

type Seen = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string }

let fakeKong: http.Server
let proxy: http.Server
let seen: Seen[]
let kongBase: string
let proxyBase: string
let kongReply: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void

const listen = (server: http.Server) =>
  new Promise<string>((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)))
const close = (server: http.Server) => new Promise<void>((resolve) => server.close(() => resolve()))

beforeEach(async () => {
  seen = []
  kongReply = (_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  }
  fakeKong = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString()
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body })
      kongReply(req, res, body)
    })
  })
  proxy = http.createServer((req, res) =>
    kongProxyMiddleware(req, res, () => {
      res.statusCode = 404
      res.end('passed to next middleware')
    }),
  )
  kongBase = await listen(fakeKong)
  proxyBase = await listen(proxy)
})

afterEach(async () => {
  await close(fakeKong)
  await close(proxy)
})

const viaProxy = (path: string, init: RequestInit = {}, target = kongBase) =>
  fetch(`${proxyBase}/__kong${path}`, { ...init, headers: { 'X-Kong-Target': target, ...(init.headers as Record<string, string>) } })

describe('kongProxyMiddleware', () => {
  it('forwards a GET with its path and query and returns Kong\'s body and status', async () => {
    const response = await viaProxy('/services?size=5&tags=a%2Cb')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/services?size=5&tags=a%2Cb' })
  })

  it('forwards the request body and the auth headers, but not the proxy\'s own header or the browser origin', async () => {
    kongReply = (_req, res) => {
      res.statusCode = 201
      res.end('{"id":"new-1"}')
    }

    const response = await viaProxy('/consumers', {
      method: 'POST',
      body: JSON.stringify({ username: 'alice' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic YWRtaW46cHc=',
        'Kong-Admin-Token': 'tok',
        Origin: 'http://localhost:5173',
      },
    })

    expect(response.status).toBe(201)
    expect(seen[0].method).toBe('POST')
    expect(JSON.parse(seen[0].body)).toEqual({ username: 'alice' })
    expect(seen[0].headers['authorization']).toBe('Basic YWRtaW46cHc=')
    expect(seen[0].headers['kong-admin-token']).toBe('tok')
    expect(seen[0].headers['content-type']).toBe('application/json')
    expect(seen[0].headers['x-kong-target']).toBeUndefined()
    expect(seen[0].headers['origin']).toBeUndefined()
  })

  it('passes a 204 with no body through', async () => {
    kongReply = (_req, res) => {
      res.statusCode = 204
      res.end()
    }

    const response = await viaProxy('/services/s1', { method: 'DELETE' })

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(seen[0].method).toBe('DELETE')
  })

  it('passes Kong\'s error status and body through unchanged, without marking it as a proxy error', async () => {
    kongReply = (_req, res) => {
      res.statusCode = 400
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ message: 'schema violation', fields: { host: 'required field missing' } }))
    }

    const response = await viaProxy('/services', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })

    expect(response.status).toBe(400)
    expect(response.headers.get('x-kong-proxy-error')).toBeNull()
    expect(await response.json()).toEqual({ message: 'schema violation', fields: { host: 'required field missing' } })
  })

  it('keeps a path prefix on the target, and ignores a trailing slash on it', async () => {
    await viaProxy('/services', {}, `${kongBase}/kong-admin/`)

    expect(seen[0].url).toBe('/kong-admin/services')
  })

  it.each([
    ['a missing target header', undefined],
    ['a target that is not a URL', 'not a url'],
    ['a non-http target', 'ftp://example.com'],
    ['a file target', 'file:///etc/passwd'],
  ])('refuses %s with a 400 marked as a proxy error, and forwards nothing', async (_label, target) => {
    const headers: Record<string, string> = target === undefined ? {} : { 'X-Kong-Target': target }
    const response = await fetch(`${proxyBase}/__kong/services`, { headers })

    expect(response.status).toBe(400)
    expect(response.headers.get('x-kong-proxy-error')).toBe('1')
    expect((await response.json()).message).toMatch(/X-Kong-Target/)
    expect(seen).toHaveLength(0)
  })

  it('answers 502 marked as a proxy error when Kong cannot be reached', async () => {
    const deadPort = (() => {
      const probe = http.createServer()
      return new Promise<string>((resolve) =>
        probe.listen(0, '127.0.0.1', () => {
          const url = `http://127.0.0.1:${(probe.address() as AddressInfo).port}`
          probe.close(() => resolve(url))
        }),
      )
    })()

    const response = await viaProxy('/', {}, await deadPort)

    expect(response.status).toBe(502)
    expect(response.headers.get('x-kong-proxy-error')).toBe('1')
    expect((await response.json()).message).toContain('Could not reach')
  })

  it('leaves every other URL to the next middleware', async () => {
    const response = await fetch(`${proxyBase}/kong-manager/`)

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('passed to next middleware')
    expect(seen).toHaveLength(0)
  })
})
