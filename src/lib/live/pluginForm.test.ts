import { describe, it, expect } from 'vitest'
import { fromEntity, newPluginForm, pluginScope, toPayload, validatePlugin } from './pluginForm'

describe('newPluginForm', () => {
  it('starts enabled, global, with the usual protocols and an empty config', () => {
    expect(newPluginForm()).toEqual({
      name: '',
      enabled: true,
      protocols: ['http', 'https', 'grpc', 'grpcs'],
      tags: [],
      config: {},
      service: '',
      route: '',
      consumer: '',
    })
  })
})

describe('fromEntity', () => {
  it('reads the name, flags, config and every scope reference', () => {
    const form = fromEntity({
      id: 'p1',
      name: 'rate-limiting',
      enabled: false,
      protocols: ['https'],
      tags: ['t'],
      config: { minute: 10 },
      service: { id: 's1' },
      route: { id: 'r1' },
      consumer: { id: 'c1' },
    })
    expect(form).toEqual({
      name: 'rate-limiting',
      enabled: false,
      protocols: ['https'],
      tags: ['t'],
      config: { minute: 10 },
      service: 's1',
      route: 'r1',
      consumer: 'c1',
    })
  })

  it('treats missing or null references as global, and tolerates odd values', () => {
    const form = fromEntity({ name: 'cors', service: null, route: undefined, consumer: 'nope', config: 'x', protocols: 5 })
    expect(form).toMatchObject({ service: '', route: '', consumer: '', config: {}, protocols: [] })
    expect(form.enabled).toBe(true)
  })
})

describe('pluginScope', () => {
  it('is global with no references, otherwise lists what it is attached to', () => {
    expect(pluginScope({ service: '', route: '', consumer: '' })).toBe('global')
    expect(pluginScope({ service: 's', route: '', consumer: '' })).toBe('service')
    expect(pluginScope({ service: '', route: 'r', consumer: '' })).toBe('route')
    expect(pluginScope({ service: 's', route: '', consumer: 'c' })).toBe('service + consumer')
    expect(pluginScope({ service: 's', route: 'r', consumer: 'c' })).toBe('service + route + consumer')
  })
})

describe('validatePlugin', () => {
  it('needs a plugin to be chosen', () => {
    expect(validatePlugin(newPluginForm())).toEqual(['Please choose a plugin.'])
    expect(validatePlugin({ ...newPluginForm(), name: '  ' })).toEqual(['Please choose a plugin.'])
    expect(validatePlugin({ ...newPluginForm(), name: 'cors' })).toEqual([])
  })
})

describe('toPayload', () => {
  const form = () => ({ ...newPluginForm(), name: 'cors', tags: [' a ', '', 'b'] })

  it('creates with the name, flags, cleaned tags and config, and leaves unset references out', () => {
    expect(toPayload(form(), 'create')).toEqual({
      name: 'cors',
      enabled: true,
      protocols: ['http', 'https', 'grpc', 'grpcs'],
      tags: ['a', 'b'],
      config: {},
    })
  })

  it('attaches the chosen service, route and consumer as id references', () => {
    const payload = toPayload({ ...form(), service: 's1', route: 'r1', consumer: 'c1' }, 'create')
    expect(payload).toMatchObject({ service: { id: 's1' }, route: { id: 'r1' }, consumer: { id: 'c1' } })
  })

  it('never sends the name on update, because Kong does not allow renaming a plugin', () => {
    expect(toPayload(form(), 'update')).not.toHaveProperty('name')
  })

  it('clears a reference with null on update so the plugin can be made global again', () => {
    const payload = toPayload({ ...form(), service: '' }, 'update')
    expect(payload.service).toBeNull()
    expect(payload.route).toBeNull()
    expect(payload.consumer).toBeNull()
  })

  it('omits an empty protocols list instead of sending one Kong would reject', () => {
    expect(toPayload({ ...form(), protocols: [] }, 'create')).not.toHaveProperty('protocols')
  })

  it('passes the config through untouched, nested values included', () => {
    const config = { redis: { host: 'r', port: 6379 }, list: ['a'] }
    expect(toPayload({ ...form(), config }, 'create').config).toEqual(config)
  })
})
