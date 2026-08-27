import type { Tournament } from '../domain/tournament'
import {
  cloneAchievementConfig,
  DEFAULT_ACHIEVEMENT_CONFIG,
  DEFAULT_ROTATING_ACHIEVEMENTS,
  LEGACY_ACHIEVEMENT_CONFIG,
  recalculateTournamentAchievementPoints,
} from '../domain/achievements'
import { createLocalPlayerKey } from '../domain/participants'
import type { TournamentRepository } from './tournamentRepository'

export const TOURNAMENT_STORAGE_KEY = 'area52.commander-manager.current-tournament'
export const TOURNAMENT_STORAGE_VERSION = 8

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface TournamentSnapshot {
  version: number
  tournament: Tournament
}

function isTournament(value: unknown): value is Tournament {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Tournament>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.date === 'string' &&
    Array.isArray(candidate.participants) &&
    Array.isArray(candidate.rounds) &&
    Array.isArray(candidate.rotatingAchievements) &&
    candidate.dateCreditConfig !== null &&
    typeof candidate.dateCreditConfig === 'object'
  )
}

export function serializeTournament(tournament: Tournament): string {
  const snapshot: TournamentSnapshot = { version: TOURNAMENT_STORAGE_VERSION, tournament }
  return JSON.stringify(snapshot)
}

export function migrateTournament(tournament: Tournament): Tournament {
  const prizeMode = tournament.prizeMode ?? 'manual_credit'
  const type =
    tournament.type ??
    (tournament.leaguePeriodId || prizeMode === 'league_auto' ? 'league_date' : 'independent')

  const storedAchievementConfig = tournament.achievementConfig
  const inferredAchievementConfig = storedAchievementConfig
    ? cloneAchievementConfig(storedAchievementConfig)
    : tournament.status === 'finished'
      ? {
          ...cloneAchievementConfig(LEGACY_ACHIEVEMENT_CONFIG),
          rotating1: {
            enabled: true,
            points:
              tournament.rotatingAchievements.find((item) => item.id === 'rotating1')?.points ?? 1,
          },
          rotating2: {
            enabled: true,
            points:
              tournament.rotatingAchievements.find((item) => item.id === 'rotating2')?.points ?? 1,
          },
          rotating3: {
            enabled: true,
            points:
              tournament.rotatingAchievements.find((item) => item.id === 'rotating3')?.points ?? 1,
          },
        }
      : cloneAchievementConfig(DEFAULT_ACHIEVEMENT_CONFIG)

  const migrated: Tournament = {
    ...tournament,
    type,
    prizeMode,
    pairingMode: tournament.pairingMode ?? 'balanced_random',
    leaguePeriodId: type === 'league_date' ? tournament.leaguePeriodId : undefined,
    participants: tournament.participants.map((participant) => ({
      ...participant,
      isGhost: participant.isGhost ?? false,
      playerKey:
        !participant.playerKey || participant.playerKey === participant.id
          ? createLocalPlayerKey(participant.name)
          : participant.playerKey,
    })),
    prizeParticipantIds:
      tournament.prizeParticipantIds ??
      tournament.participants
        .filter((participant) => !(participant.isGhost ?? false))
        .map((participant) => participant.id),
    prizePlayerCount:
      tournament.prizePlayerCount ??
      tournament.participants.filter((participant) => !(participant.isGhost ?? false)).length,
    achievementConfig: inferredAchievementConfig,
    rotatingAchievements:
      tournament.rotatingAchievements?.length > 0
        ? tournament.rotatingAchievements.slice(0, 5).map((achievement) => ({ ...achievement }))
        : DEFAULT_ROTATING_ACHIEVEMENTS.map((achievement) => ({ ...achievement })),
    ghostPairingAuthorized: tournament.ghostPairingAuthorized ?? false,
    financialReviewRequired: tournament.financialReviewRequired ?? false,
    rounds: tournament.rounds.map((round) => ({
      ...round,
      isCorrectionMode: round.isCorrectionMode ?? false,
      wasEditedAfterFinish: round.wasEditedAfterFinish ?? false,
      tables: round.tables.map((table) => ({
        ...table,
        editCount: table.editCount ?? 0,
        results: table.results.map((result) => ({
          ...result,
          rotating4: result.rotating4 ?? false,
          rotating5: result.rotating5 ?? false,
        })),
        savedResults: (
          table.savedResults ?? (table.status === 'saved' ? table.results : [])
        ).map((result) => ({
          ...result,
          rotating4: result.rotating4 ?? false,
          rotating5: result.rotating5 ?? false,
        })),
      })),
    })),
  }

  // Los torneos activos adoptan los defaults nuevos y actualizan derivados. Los
  // finalizados conservan tanto sus totales históricos como la regla win=1 inferida.
  return !storedAchievementConfig && tournament.status !== 'finished'
    ? recalculateTournamentAchievementPoints(migrated, inferredAchievementConfig)
    : migrated
}

export function deserializeTournament(serialized: string): Tournament | null {
  try {
    const snapshot = JSON.parse(serialized) as Partial<TournamentSnapshot>
    if (
      ![1, 2, 3, 4, 5, 6, 7, TOURNAMENT_STORAGE_VERSION].includes(snapshot.version ?? -1) ||
      !isTournament(snapshot.tournament)
    ) {
      return null
    }

    return migrateTournament(snapshot.tournament)
  } catch {
    return null
  }
}

export class LocalStorageTournamentRepository implements TournamentRepository {
  constructor(
    private readonly storage: StorageLike,
    private readonly storageKey = TOURNAMENT_STORAGE_KEY,
  ) {}

  async getCurrentTournament(): Promise<Tournament | null> {
    const serialized = this.storage.getItem(this.storageKey)
    return serialized ? deserializeTournament(serialized) : null
  }

  async saveTournament(tournament: Tournament): Promise<void> {
    this.storage.setItem(this.storageKey, serializeTournament(tournament))
  }

  async clearCurrentTournament(): Promise<void> {
    this.storage.removeItem(this.storageKey)
  }
}

export function createBrowserTournamentRepository(): TournamentRepository {
  return new LocalStorageTournamentRepository(window.localStorage)
}
