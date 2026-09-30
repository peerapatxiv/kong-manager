import { defineStore } from 'pinia'
import { loadSavedConnections, persistSavedConnections } from '../lib/savedConnections'
import type { SavedConnection } from '../lib/savedConnections'

export type ConnectionInput = {
  baseUrl: string
  username?: string
  password?: string
  name?: string
  autoConnect?: boolean
}

export const useSavedConnectionsStore = defineStore('savedConnections', {
  state: () => ({
    connections: loadSavedConnections() as SavedConnection[],
    /** In-memory only: auto-connect runs at most once per browser session. */
    autoConnectTried: false,
  }),
  getters: {
    autoConnection: (state): SavedConnection | null => state.connections.find((c) => c.autoConnect) ?? null,
  },
  actions: {
    // Name and the automatic flag only change when a value is given, so a
    // reconnect from the saved list (URL and credentials only) never blanks them.
    upsert(conn: ConnectionInput) {
      let target = this.connections.find((c) => c.baseUrl === conn.baseUrl)
      if (target) {
        target.username = conn.username
        target.password = conn.password
      } else {
        target = {
          id: crypto.randomUUID(),
          baseUrl: conn.baseUrl,
          username: conn.username,
          password: conn.password,
          createdAt: Date.now(),
        }
        this.connections.push(target)
        target = this.connections[this.connections.length - 1]
      }
      if (conn.name !== undefined) target.name = conn.name
      if (conn.autoConnect !== undefined) {
        if (conn.autoConnect) {
          for (const other of this.connections) {
            if (other.id !== target.id) other.autoConnect = false
          }
        }
        target.autoConnect = conn.autoConnect
      }
      persistSavedConnections(this.connections)
    },
    remove(id: string) {
      this.connections = this.connections.filter((c) => c.id !== id)
      persistSavedConnections(this.connections)
    },
    markAutoConnectTried() {
      this.autoConnectTried = true
    },
  },
})
