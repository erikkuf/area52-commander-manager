import type { AppStateRepository, PersistedAppState } from './appStateRepository'
import {
  deserializeAppWorkspace,
  serializeAppWorkspace,
} from './localStorageAppWorkspaceRepository'
import {
  deserializeLeaguePrizeLedger,
  serializeLeaguePrizeLedger,
} from './localStorageLeaguePrizeRepository'

export const APP_STATE_STORAGE_KEY = 'area52.commander-manager.app-state'
export const APP_STATE_STORAGE_VERSION = 1

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function serializeAppState(state: PersistedAppState): string {
  return JSON.stringify({
    version: APP_STATE_STORAGE_VERSION,
    workspace: serializeAppWorkspace(state.workspace),
    ledger: serializeLeaguePrizeLedger(state.ledger),
  })
}

export function deserializeAppState(serialized: string): PersistedAppState | null {
  try {
    const snapshot = JSON.parse(serialized) as {
      version?: number
      workspace?: string
      ledger?: string
    }
    if (
      snapshot.version !== APP_STATE_STORAGE_VERSION ||
      typeof snapshot.workspace !== 'string' ||
      typeof snapshot.ledger !== 'string'
    ) return null
    const workspace = deserializeAppWorkspace(snapshot.workspace)
    const ledger = deserializeLeaguePrizeLedger(snapshot.ledger)
    return workspace && ledger ? { workspace, ledger } : null
  } catch {
    return null
  }
}

export class LocalStorageAppStateRepository implements AppStateRepository {
  constructor(
    private readonly storage: StorageLike,
    private readonly storageKey = APP_STATE_STORAGE_KEY,
  ) {}

  async getState(): Promise<PersistedAppState | null> {
    const serialized = this.storage.getItem(this.storageKey)
    return serialized ? deserializeAppState(serialized) : null
  }

  async saveState(state: PersistedAppState): Promise<void> {
    // localStorage.setItem reemplaza el valor completo en una única operación síncrona.
    this.storage.setItem(this.storageKey, serializeAppState(state))
  }
}

export function createBrowserAppStateRepository(): AppStateRepository {
  return new LocalStorageAppStateRepository(window.localStorage)
}
