import { ENTITY_RESOURCES } from '../kongAdmin/entities'

// A Kong plugin can be tied to a service, a route and a consumer all at once, so the three
// are independent optional references (an empty string means "not set"). Choosing only one
// of them would silently drop the others whenever such a plugin was saved.
export type PluginForm = {
  name: string
  enabled: boolean
  protocols: string[]
  tags: string[]
  config: Record<string, unknown>
  service: string
  route: string
  consumer: string
}

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const referenceId = (value: unknown): string => {
  const id = (value as { id?: unknown } | null | undefined)?.id
  return typeof id === 'string' ? id : ''
}

export function fromEntity(entity: Record<string, unknown>): PluginForm {
  const config = entity.config
  return {
    name: typeof entity.name === 'string' ? entity.name : '',
    enabled: typeof entity.enabled === 'boolean' ? entity.enabled : true,
    protocols: stringList(entity.protocols),
    tags: stringList(entity.tags),
    config: typeof config === 'object' && config !== null && !Array.isArray(config) ? (config as Record<string, unknown>) : {},
    service: referenceId(entity.service),
    route: referenceId(entity.route),
    consumer: referenceId(entity.consumer),
  }
}

export function newPluginForm(): PluginForm {
  return fromEntity({ ...ENTITY_RESOURCES.plugins.defaults, config: {} })
}

/** "global", or what the plugin is attached to, such as "service + consumer". */
export function pluginScope(form: Pick<PluginForm, 'service' | 'route' | 'consumer'>): string {
  const attached = (['service', 'route', 'consumer'] as const).filter((key) => form[key] !== '')
  return attached.length === 0 ? 'global' : attached.join(' + ')
}

export function validatePlugin(form: PluginForm): string[] {
  return form.name.trim() === '' ? ['Please choose a plugin.'] : []
}

export function toPayload(form: PluginForm, mode: 'create' | 'update'): Record<string, unknown> {
  const reference = (id: string) => (id ? { id } : null)
  const payload: Record<string, unknown> = {
    enabled: form.enabled,
    tags: form.tags.map((tag) => tag.trim()).filter(Boolean),
    config: form.config,
    service: reference(form.service),
    route: reference(form.route),
    consumer: reference(form.consumer),
  }
  if (form.protocols.length > 0) payload.protocols = form.protocols

  if (mode === 'create') {
    payload.name = form.name.trim()
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== undefined))
  }
  return payload
}
