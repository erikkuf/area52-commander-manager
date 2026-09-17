import { recalculateTournamentAchievementPoints } from './achievements'
import { DomainError } from './errors'
import {
  calculateTournamentStanding,
  calculateTheoreticalTournamentStanding,
  normalizeAdministrativeStandingOrder,
  type TournamentStandingEntry,
} from './leaderboard'
import {
  buildTournamentBeforeRoundCorrection,
  closeRoundCorrection,
  roundCorrectionHasChanges,
} from './results'
import type { Tournament } from './tournament'

export interface StandingPreviewEntry extends TournamentStandingEntry {
  playerName: string
}

export interface StandingCorrectionPreview {
  previous: StandingPreviewEntry[]
  next: StandingPreviewEntry[]
  changed: boolean
}

function withNames(
  tournament: Tournament,
  entries: TournamentStandingEntry[],
): StandingPreviewEntry[] {
  const names = new Map(
    tournament.participants.map((participant) => [participant.id, participant.name]),
  )
  return entries.map((entry) => ({
    ...entry,
    playerName: names.get(entry.participantId) ?? 'Jugador',
  }))
}

export function previewTableCorrection(
  tournament: Tournament,
  roundId: string,
  tableId: string,
): StandingCorrectionPreview {
  const round = tournament.rounds.find((item) => item.id === roundId)
  const table = round?.tables.find((item) => item.id === tableId)
  if (!round || !table) throw new DomainError('No se encontró la mesa que intentas corregir.')
  if (table.status !== 'edited') {
    throw new DomainError('La mesa debe tener una corrección pendiente para comparar el Standing.')
  }
  const previous = withNames(tournament, calculateTournamentStanding(tournament))
  const previewTournament: Tournament = {
    ...tournament,
    rounds: tournament.rounds.map((item) =>
      item.id !== roundId
        ? item
        : {
            ...item,
            tables: item.tables.map((currentTable) =>
              currentTable.id === tableId
                ? {
                    ...currentTable,
                    status: 'saved',
                    savedResults: currentTable.results.map((result) => ({ ...result })),
                  }
                : currentTable,
            ),
          },
    ),
  }
  const next = withNames(previewTournament, calculateTournamentStanding(previewTournament))
  return {
    previous,
    next,
    changed:
      previous.length !== next.length ||
      previous.some(
        (entry, index) =>
          entry.participantId !== next[index]?.participantId ||
          entry.totalPoints !== next[index]?.totalPoints,
      ),
  }
}

export function previewRoundCorrection(
  tournament: Tournament,
  roundId: string,
): StandingCorrectionPreview {
  const round = tournament.rounds.find((item) => item.id === roundId)
  if (!round?.isCorrectionMode) {
    throw new DomainError('No existe una sesión de corrección activa para esta ronda.')
  }
  const previousTournament = buildTournamentBeforeRoundCorrection(tournament, roundId)
  const previous = withNames(
    previousTournament,
    calculateTournamentStanding(previousTournament),
  )
  const next = withNames(
    tournament,
    calculateTheoreticalTournamentStanding(tournament),
  )
  return {
    previous,
    next,
    changed:
      previous.length !== next.length ||
      previous.some(
        (entry, index) =>
          entry.participantId !== next[index]?.participantId ||
          entry.totalPoints !== next[index]?.totalPoints ||
          entry.tableWins !== next[index]?.tableWins ||
          entry.eliminations !== next[index]?.eliminations,
      ),
  }
}

export function tournamentCorrectionHasFinancialImpact(tournament: Tournament): boolean {
  return (
    tournament.status === 'finished' &&
    (tournament.prizeMode === 'league_auto' ||
      (tournament.prizeMode === 'manual_credit' &&
        tournament.dateCreditConfig.prizePool > 0))
  )
}

export function finalizeRoundCorrectionSession(
  tournament: Tournament,
  roundId: string,
  administrativeStandingParticipantIds?: string[],
  now = new Date().toISOString(),
): Tournament {
  const round = tournament.rounds.find((item) => item.id === roundId)
  if (!round?.isCorrectionMode) {
    throw new DomainError('No existe una sesión de corrección activa para esta ronda.')
  }
  const changed = roundCorrectionHasChanges(round)
  const administrativeOrder = normalizeAdministrativeStandingOrder(
    tournament,
    administrativeStandingParticipantIds,
  )
  let prepared = tournament
  if (changed || administrativeOrder) {
    prepared = {
      ...tournament,
      administrativeStandingParticipantIds:
        administrativeOrder ??
        (changed ? undefined : tournament.administrativeStandingParticipantIds),
      financialReviewRequired:
        tournament.financialReviewRequired ||
        tournamentCorrectionHasFinancialImpact(tournament),
      financialReviewResolvedAt: tournamentCorrectionHasFinancialImpact(tournament)
        ? undefined
        : tournament.financialReviewResolvedAt,
    }
  }
  return closeRoundCorrection(prepared, roundId, now)
}

export function recalculateTournamentStanding(tournament: Tournament): Tournament {
  return recalculateTournamentAchievementPoints(tournament, tournament.achievementConfig)
}

export function markTournamentFinancialReviewRequired(
  tournament: Tournament,
  now = new Date().toISOString(),
): Tournament {
  if (!tournamentCorrectionHasFinancialImpact(tournament)) return tournament
  return {
    ...tournament,
    financialReviewRequired: true,
    financialReviewResolvedAt: undefined,
    updatedAt: now,
  }
}

export function resolveTournamentFinancialReview(
  tournament: Tournament,
  now = new Date().toISOString(),
): Tournament {
  return {
    ...tournament,
    financialReviewRequired: false,
    financialReviewResolvedAt: now,
    updatedAt: now,
  }
}
