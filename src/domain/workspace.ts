import type {
  LeagueAchievementDefinition,
  LeaguePrizeLedger,
  RotatingAchievementDefinition,
  Tournament,
  TournamentPenaltyDefinition,
} from './tournament'
import type { PlayerIdentity } from './playerRegistry'
import { buildPlayerRegistry } from './playerRegistry'
import {
  buildLeagueAchievementCatalog,
  buildRotatingAchievementCatalog,
  buildTournamentPenaltyCatalog,
  DEFAULT_LEAGUE_ACHIEVEMENT_CATALOG,
  DEFAULT_ROTATING_ACHIEVEMENT_CATALOG,
} from './achievementCatalogs'

export type GlobalSection = 'home' | 'leagues' | 'events' | 'hall_of_fame' | 'settings'
export type LeagueDetailTab = 'summary' | 'dates' | 'leaderboard'
export type TournamentManagerView = 'tables' | 'standing' | 'settings'
export type EventCreationType = 'league_date' | 'independent'

export interface AppNavigationState {
  globalSection: GlobalSection
  selectedLeaguePeriodId?: string
  openedTournamentId?: string
  leagueDetailTab: LeagueDetailTab
  managerView: TournamentManagerView
  creationType?: EventCreationType
}

export interface AppWorkspace {
  tournaments: Tournament[]
  playerRegistry: PlayerIdentity[]
  rotatingAchievementCatalog: RotatingAchievementDefinition[]
  leagueAchievementCatalog: LeagueAchievementDefinition[]
  tournamentPenaltyCatalog: TournamentPenaltyDefinition[]
  navigation: AppNavigationState
  /** Marcador transitorio: un respaldo antiguo aún no reconstruyó su catálogo desde el ledger. */
  legacyLeagueCatalogNeedsRebuild?: boolean
}

export const DEFAULT_NAVIGATION_STATE: AppNavigationState = {
  globalSection: 'home',
  leagueDetailTab: 'summary',
  managerView: 'tables',
}

export function createEmptyWorkspace(): AppWorkspace {
  return {
    tournaments: [],
    playerRegistry: [],
    rotatingAchievementCatalog: DEFAULT_ROTATING_ACHIEVEMENT_CATALOG.map((item) => ({ ...item })),
    leagueAchievementCatalog: DEFAULT_LEAGUE_ACHIEVEMENT_CATALOG.map((item) => ({ ...item })),
    tournamentPenaltyCatalog: [],
    navigation: { ...DEFAULT_NAVIGATION_STATE },
  }
}

export function ensureWorkspaceAchievementCatalogs(
  workspace: AppWorkspace,
  ledger?: LeaguePrizeLedger,
): AppWorkspace {
  const { legacyLeagueCatalogNeedsRebuild, ...persistableWorkspace } = workspace
  return {
    ...persistableWorkspace,
    rotatingAchievementCatalog: buildRotatingAchievementCatalog(
      workspace.rotatingAchievementCatalog,
      workspace.tournaments,
      ledger?.leaguePeriods,
    ),
    leagueAchievementCatalog: buildLeagueAchievementCatalog(
      legacyLeagueCatalogNeedsRebuild ? undefined : workspace.leagueAchievementCatalog,
      ledger?.specialPointMovements,
    ),
    tournamentPenaltyCatalog: buildTournamentPenaltyCatalog(workspace.tournamentPenaltyCatalog),
  }
}

export function upsertWorkspaceTournament(
  workspace: AppWorkspace,
  tournament: Tournament,
): AppWorkspace {
  const exists = workspace.tournaments.some((item) => item.id === tournament.id)
  const tournaments = exists
    ? workspace.tournaments.map((item) => (item.id === tournament.id ? tournament : item))
    : [...workspace.tournaments, tournament]
  return {
    ...workspace,
    tournaments,
    playerRegistry: buildPlayerRegistry(tournaments, workspace.playerRegistry),
  }
}

export function mergeLegacyTournament(
  workspace: AppWorkspace,
  tournament: Tournament | null,
): AppWorkspace {
  if (!tournament) return workspace
  const merged = upsertWorkspaceTournament(workspace, tournament)
  if (workspace.tournaments.length > 0 || workspace.navigation.openedTournamentId) return merged
  return {
    ...merged,
    navigation: { ...merged.navigation, openedTournamentId: tournament.id },
  }
}
