export type SavedConnection = {
  id: string
  baseUrl: string
  username?: string
  password?: string
  /** Display name, e.g. "Staging server". Older entries have none. */
  name?: string
  colorCode?: string
  /** Epoch milliseconds. Older entries have none. */
  createdAt?: number
  /** Connect to this one when the app opens. At most one connection has it set. */
  autoConnect?: boolean
}

const STORAGE_KEY = 'kong-manager:saved-connections'

export function loadSavedConnections(): SavedConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedConnection[]) : []
  } catch {
    return []
  }
}

export function persistSavedConnections(connections: SavedConnection[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections))
}
