import { defineStore } from 'pinia'
import { loadSavedConnections, persistSavedConnections } from '../lib/savedConnections'
import type { SavedConnection } from '../lib/savedConnections'

export type ConnectionInput = {
  baseUrl: string
  username?: string
  password?: string
  name?: string
}

export const useSavedConnectionsStore = defineStore('savedConnections', {
  state: () => ({
    connections: loadSavedConnections() as SavedConnection[],
  }),
  actions: {
    // The name only changes when a value is given, so a reconnect from the saved
    // list (URL and credentials only) never blanks it.
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
      persistSavedConnections(this.connections)
    },
    remove(id: string) {
      this.connections = this.connections.filter((c) => c.id !== id)
      persistSavedConnections(this.connections)
    },
  },
})
