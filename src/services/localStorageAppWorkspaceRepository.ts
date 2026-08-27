import type { AppWorkspace, AppNavigationState } from '../domain/workspace'
import { DEFAULT_NAVIGATION_STATE } from '../domain/workspace'
import { migrateTournament } from './localStorageTournamentRepository'
import { buildPlayerRegistry } from '../domain/playerRegistry'
import type { AppWorkspaceRepository } from './appWorkspaceRepository'

export const APP_WORKSPACE_STORAGE_KEY = 'area52.commander-manager.workspace'
export const APP_WORKSPACE_STORAGE_VERSION = 5

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function normalizeNavigation(value: unknown): AppNavigationState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_NAVIGATION_STATE }
  const candidate = value as Partial<AppNavigationState>
  const globalSection = ['home', 'leagues', 'events', 'hall_of_fame', 'settings'].includes(
    candidate.globalSection ?? '',
  )
    ? candidate.globalSection!
    : 'home'
  const legacyLeagueTab = candidate.leagueDetailTab as string | undefined
  const leagueDetailTab = legacyLeagueTab === 'standings'
    ? 'leaderboard'
    : ['summary', 'dates', 'leaderboard'].includes(legacyLeagueTab ?? '')
      ? (legacyLeagueTab as AppNavigationState['leagueDetailTab'])
      : 'summary'
  const legacyManagerView = candidate.managerView as string | undefined
  const managerView = legacyManagerView === 'leaderboard'
    ? 'standing'
    : ['tables', 'standing', 'settings'].includes(legacyManagerView ?? '')
      ? (legacyManagerView as AppNavigationState['managerView'])
      : 'tables'
  return {
    globalSection,
    leagueDetailTab,
    managerView,
    ...(candidate.selectedLeaguePeriodId ? { selectedLeaguePeriodId: candidate.selectedLeaguePeriodId } : {}),
    ...(candidate.openedTournamentId ? { openedTournamentId: candidate.openedTournamentId } : {}),
    ...(candidate.creationType === 'league_date' || candidate.creationType === 'independent'
      ? { creationType: candidate.creationType }
      : {}),
  }
}

export function serializeAppWorkspace(workspace: AppWorkspace): string {
  return JSON.stringify({ version: APP_WORKSPACE_STORAGE_VERSION, workspace })
}

export function deserializeAppWorkspace(serialized: string): AppWorkspace | null {
  try {
    const snapshot = JSON.parse(serialized) as {
      version?: number
      workspace?: Partial<AppWorkspace>
    }
    if (
      ![1, 2, 3, 4, APP_WORKSPACE_STORAGE_VERSION].includes(snapshot.version ?? -1) ||
      !snapshot.workspace ||
      !Array.isArray(snapshot.workspace.tournaments)
    ) {
      return null
    }
    const tournaments = snapshot.workspace.tournaments.map((tournament) =>
        migrateTournament(tournament),
      )
    return {
      tournaments,
      playerRegistry: buildPlayerRegistry(tournaments, snapshot.workspace.playerRegistry ?? []),
      navigation: normalizeNavigation(snapshot.workspace.navigation),
    }
  } catch {
    return null
  }
}

export class LocalStorageAppWorkspaceRepository implements AppWorkspaceRepository {
  constructor(
    private readonly storage: StorageLike,
    private readonly storageKey = APP_WORKSPACE_STORAGE_KEY,
  ) {}

  async getWorkspace(): Promise<AppWorkspace | null> {
    const serialized = this.storage.getItem(this.storageKey)
    return serialized ? deserializeAppWorkspace(serialized) : null
  }

  async saveWorkspace(workspace: AppWorkspace): Promise<void> {
    this.storage.setItem(this.storageKey, serializeAppWorkspace(workspace))
  }
}

export function createBrowserAppWorkspaceRepository(): AppWorkspaceRepository {
  return new LocalStorageAppWorkspaceRepository(window.localStorage)
}
