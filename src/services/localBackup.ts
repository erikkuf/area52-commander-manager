import type { LeaguePrizeLedger, Tournament } from '../domain/tournament'
import type { AppWorkspace } from '../domain/workspace'
import {
  APP_WORKSPACE_STORAGE_KEY,
  deserializeAppWorkspace,
  serializeAppWorkspace,
} from './localStorageAppWorkspaceRepository'
import {
  deserializeLeaguePrizeLedger,
  LEAGUE_PRIZE_STORAGE_KEY,
  serializeLeaguePrizeLedger,
} from './localStorageLeaguePrizeRepository'
import {
  deserializeTournament,
  serializeTournament,
  TOURNAMENT_STORAGE_KEY,
} from './localStorageTournamentRepository'
import {
  APP_STATE_STORAGE_KEY,
  deserializeAppState,
  serializeAppState,
} from './localStorageAppStateRepository'

export interface LocalBackupData {
  workspace: AppWorkspace
  ledger: LeaguePrizeLedger
  currentTournament: Tournament | null
}

interface LocalBackupEnvelope {
  app: string
  exportedAt: string
  origin: string
  data: Record<string, string>
}

export function createLocalBackup(
  workspace: AppWorkspace,
  ledger: LeaguePrizeLedger,
  origin: string,
  now = new Date().toISOString(),
): string {
  const currentTournament = workspace.tournaments.find(
    (tournament) => tournament.id === workspace.navigation.openedTournamentId,
  )
  const data: Record<string, string> = {
    [APP_STATE_STORAGE_KEY]: serializeAppState({ workspace, ledger }),
    [APP_WORKSPACE_STORAGE_KEY]: serializeAppWorkspace(workspace),
    [LEAGUE_PRIZE_STORAGE_KEY]: serializeLeaguePrizeLedger(ledger),
  }
  if (currentTournament) {
    data[TOURNAMENT_STORAGE_KEY] = serializeTournament(currentTournament)
  }
  const envelope: LocalBackupEnvelope = {
    app: 'Area 52 Commander Manager',
    exportedAt: now,
    origin,
    data,
  }
  return JSON.stringify(envelope, null, 2)
}

export function parseLocalBackup(serialized: string): LocalBackupData {
  const envelope = JSON.parse(serialized) as Partial<LocalBackupEnvelope>
  if (!envelope.data || typeof envelope.data !== 'object') {
    throw new Error('El archivo no contiene un respaldo válido de Área 52 Commander Manager.')
  }
  const unifiedSource = envelope.data[APP_STATE_STORAGE_KEY]
  const unifiedState = unifiedSource ? deserializeAppState(unifiedSource) : null
  const workspaceSource = envelope.data[APP_WORKSPACE_STORAGE_KEY]
  const ledgerSource = envelope.data[LEAGUE_PRIZE_STORAGE_KEY]
  const workspace = unifiedState?.workspace ?? (workspaceSource ? deserializeAppWorkspace(workspaceSource) : null)
  const ledger = unifiedState?.ledger ?? (ledgerSource ? deserializeLeaguePrizeLedger(ledgerSource) : null)
  if (!workspace || !ledger) {
    throw new Error('El respaldo está incompleto o usa una versión no compatible.')
  }
  const currentSource = envelope.data[TOURNAMENT_STORAGE_KEY]
  return {
    workspace,
    ledger,
    currentTournament: currentSource ? deserializeTournament(currentSource) : null,
  }
}

export function downloadLocalBackup(serialized: string, filename: string): void {
  const blob = new Blob([serialized], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
