import { recalculateTournamentAchievementPoints } from './achievements'
import { DomainError } from './errors'
import {
  calculateTournamentStanding,
  type TournamentStandingEntry,
} from './leaderboard'
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

export function recalculateTournamentStanding(tournament: Tournament): Tournament {
  return recalculateTournamentAchievementPoints(tournament, tournament.achievementConfig)
}

export function markTournamentFinancialReviewRequired(
  tournament: Tournament,
  now = new Date().toISOString(),
): Tournament {
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
