export type KongPlugin = {
  name: string
  enabled?: boolean
  protocols?: string[]
  config?: Record<string, unknown>
  tags?: string[]
  [key: string]: unknown
}

export type KongRoute = {
  name?: string
  hosts?: string[]
  paths?: string[]
  methods?: string[]
  protocols?: string[]
  strip_path?: boolean
  preserve_host?: boolean
  path_handling?: string
  https_redirect_status_code?: number
  regex_priority?: number
  request_buffering?: boolean
  response_buffering?: boolean
  tags?: string[]
  plugins?: KongPlugin[]
  [key: string]: unknown
}

export type KongService = {
  name?: string
  host: string
  port?: number
  protocol?: string
  path?: string
  connect_timeout?: number
  read_timeout?: number
  write_timeout?: number
  retries?: number
  enabled?: boolean
  tags?: string[]
  routes?: KongRoute[]
  [key: string]: unknown
}

export type KongConsumer = {
  username?: string
  custom_id?: string
  tags?: string[]
  [key: string]: unknown
}

export type KongConfig = {
  _format_version: string
  consumers?: KongConsumer[]
  plugins?: KongPlugin[]
  services?: KongService[]
  [key: string]: unknown
}

export const KONG_PROTOCOLS = ['http', 'https', 'grpc', 'grpcs', 'tcp', 'tls', 'udp'] as const
