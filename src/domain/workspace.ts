import type { Tournament } from './tournament'
import type { PlayerIdentity } from './playerRegistry'
import { buildPlayerRegistry } from './playerRegistry'

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
  navigation: AppNavigationState
}

export const DEFAULT_NAVIGATION_STATE: AppNavigationState = {
  globalSection: 'home',
  leagueDetailTab: 'summary',
  managerView: 'tables',
}

export function createEmptyWorkspace(): AppWorkspace {
  return { tournaments: [], playerRegistry: [], navigation: { ...DEFAULT_NAVIGATION_STATE } }
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
