import { ENTITY_RESOURCES } from '../kongAdmin/entities'

export type ConsumerForm = {
  username: string
  custom_id: string
  tags: string[]
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

export function fromEntity(entity: Record<string, unknown>): ConsumerForm {
  return {
    username: text(entity.username),
    custom_id: text(entity.custom_id),
    tags: stringList(entity.tags),
  }
}

export function newConsumerForm(): ConsumerForm {
  return fromEntity(ENTITY_RESOURCES.consumers.defaults)
}

export function validateConsumer(form: ConsumerForm): string[] {
  if (form.username.trim() === '' && form.custom_id.trim() === '') {
    return ['Please provide either a username or a custom ID.']
  }
  return []
}

export function toPayload(form: ConsumerForm, mode: 'create' | 'update'): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    username: form.username.trim() || null,
    custom_id: form.custom_id.trim() || null,
    tags: form.tags.map((tag) => tag.trim()).filter(Boolean),
  }
  if (mode === 'create') {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null))
  }
  return payload
}
