import type { LeaguePrizeLedger } from '../domain/tournament'
import type { AppWorkspace } from '../domain/workspace'

export interface PersistedAppState {
  workspace: AppWorkspace
  ledger: LeaguePrizeLedger
}

export interface AppStateRepository {
  getState(): Promise<PersistedAppState | null>
  saveState(state: PersistedAppState): Promise<void>
}
