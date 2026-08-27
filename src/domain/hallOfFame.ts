import { DomainError } from './errors'
import type { LeagueLeaderboardEntry } from './league'
import type {
  ChampionPhotoReference,
  IdFactory,
  LeagueChampionSnapshot,
  LeaguePeriod,
  LeaguePrizeLedger,
  Tournament,
} from './tournament'
import { createId } from '../utils/id'

export interface ChampionSnapshotMetadata {
  championPhoto?: ChampionPhotoReference
  commanderName?: string
  deckName?: string
  deckUrl?: string
}

export type MissingChampionSnapshotReason =
  | 'league_not_finished'
  | 'review_required'
  | 'no_champion'
  | 'unresolved_tie'

export interface ChampionSnapshotReadiness {
  ready: boolean
  reason?: MissingChampionSnapshotReason
  message?: string
  champion?: LeagueLeaderboardEntry
}

function isRealLeaguePlayer(
  tournaments: Tournament[],
  leaguePeriodId: string,
  playerKey: string,
): boolean {
  const matchingParticipants = tournaments
    .filter((tournament) => tournament.leaguePeriodId === leaguePeriodId)
    .flatMap((tournament) => tournament.participants)
    .filter((participant) => participant.playerKey === playerKey)
  return matchingParticipants.some((participant) => !participant.isGhost)
}

function haveEqualChampionTieBreakers(
  first: LeagueLeaderboardEntry,
  second: LeagueLeaderboardEntry,
): boolean {
  return first.leaguePoints === second.leaguePoints &&
    first.tableWins === second.tableWins &&
    first.achievementPoints === second.achievementPoints &&
    first.eliminations === second.eliminations
}

function hasOfficialChampionOrder(
  leaguePeriod: LeaguePeriod,
  champion: LeagueLeaderboardEntry,
): boolean {
  return leaguePeriod.finalizedLeaderboardPlayerKeys?.[0] === champion.playerKey
}

function hasAdministrativeChampionOrder(
  leaguePeriod: LeaguePeriod,
  champion: LeagueLeaderboardEntry,
): boolean {
  return leaguePeriod.administrativeLeaderboardPlayerKeys?.[0] === champion.playerKey
}

export function assessChampionSnapshotReadiness(
  leaguePeriod: LeaguePeriod,
  standings: LeagueLeaderboardEntry[],
  tournaments: Tournament[],
): ChampionSnapshotReadiness {
  if (leaguePeriod.status !== 'finished') {
    return {
      ready: false,
      reason: 'league_not_finished',
      message: 'La liga debe estar finalizada para registrar un campeón oficial.',
    }
  }
  if (leaguePeriod.financialReviewRequired || leaguePeriod.reviewRequired) {
    return {
      ready: false,
      reason: 'review_required',
      message: 'La liga tiene una revisión pendiente. Resuélvela antes de generar el registro.',
    }
  }
  const champion = standings[0]
  if (
    !champion ||
    !isRealLeaguePlayer(tournaments, leaguePeriod.id, champion.playerKey)
  ) {
    return {
      ready: false,
      reason: 'no_champion',
      message: 'No se pudo determinar un campeón real desde el Leaderboard.',
    }
  }
  const runnerUp = standings[1]
  if (
    runnerUp &&
    haveEqualChampionTieBreakers(champion, runnerUp) &&
    !hasOfficialChampionOrder(leaguePeriod, champion)
  ) {
    return {
      ready: false,
      reason: 'unresolved_tie',
      message: 'El primer lugar conserva un empate sin resolución oficial.',
    }
  }
  return { ready: true, champion }
}

export function assessOfficialChampionUpdateReadiness(
  leaguePeriod: LeaguePeriod,
  standings: LeagueLeaderboardEntry[],
  tournaments: Tournament[],
): ChampionSnapshotReadiness {
  const champion = standings[0]
  if (
    !champion ||
    !isRealLeaguePlayer(tournaments, leaguePeriod.id, champion.playerKey)
  ) {
    return {
      ready: false,
      reason: 'no_champion',
      message: 'No se pudo determinar un nuevo campeón real desde el Leaderboard teórico.',
    }
  }
  const runnerUp = standings[1]
  if (
    runnerUp &&
    haveEqualChampionTieBreakers(champion, runnerUp) &&
    !hasAdministrativeChampionOrder(leaguePeriod, champion)
  ) {
    return {
      ready: false,
      reason: 'unresolved_tie',
      message: 'El Leaderboard teórico conserva un empate exacto sin resolución administrativa.',
    }
  }
  return { ready: true, champion }
}

export function buildLeagueChampionSnapshot(
  leaguePeriod: LeaguePeriod,
  standings: LeagueLeaderboardEntry[],
  tournaments: Tournament[],
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): LeagueChampionSnapshot {
  const readiness = assessChampionSnapshotReadiness(
    leaguePeriod,
    standings,
    tournaments,
  )
  if (!readiness.ready || !readiness.champion) {
    throw new DomainError(readiness.message ?? 'No se pudo registrar al campeón oficial.')
  }
  const champion = readiness.champion
  return {
    id: idFactory('league-champion'),
    leaguePeriodId: leaguePeriod.id,
    leagueName: leaguePeriod.name,
    playerKey: champion.playerKey,
    playerName: champion.playerName,
    finalPosition: 1,
    leaguePoints: champion.leaguePoints,
    achievementPoints: champion.achievementPoints,
    specialLeaguePoints: champion.specialLeaguePoints,
    tableWins: champion.tableWins,
    eliminations: champion.eliminations,
    tournamentsPlayed: champion.participations,
    createdAt: now,
    sourceClosedAt: leaguePeriod.finishedAt,
  }
}

export function createMissingLeagueChampionSnapshot(
  ledger: LeaguePrizeLedger,
  leaguePeriod: LeaguePeriod,
  standings: LeagueLeaderboardEntry[],
  tournaments: Tournament[],
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): LeaguePrizeLedger {
  if (
    ledger.championSnapshots.some(
      (snapshot) => snapshot.leaguePeriodId === leaguePeriod.id,
    )
  ) return ledger
  const snapshot = buildLeagueChampionSnapshot(
    leaguePeriod,
    standings,
    tournaments,
    idFactory,
    now,
  )
  return { ...ledger, championSnapshots: [...ledger.championSnapshots, snapshot] }
}

export function updateChampionSnapshotMetadata(
  ledger: LeaguePrizeLedger,
  snapshotId: string,
  metadata: ChampionSnapshotMetadata,
  now = new Date().toISOString(),
): LeaguePrizeLedger {
  if (!ledger.championSnapshots.some((snapshot) => snapshot.id === snapshotId)) {
    throw new DomainError('No se encontró el registro del campeón.')
  }
  const clean = (value: string | undefined) => value?.trim() || undefined
  return {
    ...ledger,
    championSnapshots: ledger.championSnapshots.map((snapshot) =>
      snapshot.id === snapshotId
        ? {
            ...snapshot,
            championPhoto: metadata.championPhoto,
            commanderName: clean(metadata.commanderName),
            deckName: clean(metadata.deckName),
            deckUrl: clean(metadata.deckUrl),
            updatedAt: now,
          }
        : snapshot,
    ),
  }
}

export function currentChampionDiffers(
  snapshot: LeagueChampionSnapshot,
  standings: LeagueLeaderboardEntry[],
): boolean {
  return Boolean(standings[0] && standings[0].playerKey !== snapshot.playerKey)
}

export function updateOfficialLeagueChampion(
  ledger: LeaguePrizeLedger,
  snapshotId: string,
  leaguePeriod: LeaguePeriod,
  standings: LeagueLeaderboardEntry[],
  tournaments: Tournament[],
  now = new Date().toISOString(),
): LeaguePrizeLedger {
  const previous = ledger.championSnapshots.find((snapshot) => snapshot.id === snapshotId)
  if (!previous) throw new DomainError('No se encontró el registro del campeón.')
  const readiness = assessOfficialChampionUpdateReadiness(
    leaguePeriod,
    standings,
    tournaments,
  )
  if (!readiness.ready || !readiness.champion) {
    throw new DomainError(readiness.message ?? 'No se pudo determinar un nuevo campeón real.')
  }
  const currentChampion = readiness.champion
  const playerChanged = currentChampion.playerKey !== previous.playerKey
  const replacement: LeagueChampionSnapshot = {
    ...previous,
    leagueName: leaguePeriod.name,
    playerKey: currentChampion.playerKey,
    playerName: currentChampion.playerName,
    leaguePoints: currentChampion.leaguePoints,
    achievementPoints: currentChampion.achievementPoints,
    specialLeaguePoints: currentChampion.specialLeaguePoints,
    tableWins: currentChampion.tableWins,
    eliminations: currentChampion.eliminations,
    tournamentsPlayed: currentChampion.participations,
    sourceClosedAt: leaguePeriod.finishedAt ?? previous.sourceClosedAt,
    updatedAt: now,
    ...(playerChanged
      ? {
          championPhoto: undefined,
          commanderName: undefined,
          deckName: undefined,
          deckUrl: undefined,
        }
      : {}),
  }
  return {
    ...ledger,
    championSnapshots: ledger.championSnapshots.map((snapshot) =>
      snapshot.id === snapshotId ? replacement : snapshot,
    ),
  }
}
