import { calculateTournamentStanding } from './leaderboard'
import type { LeaguePeriod, Tournament } from './tournament'

export interface TournamentWinner {
  participantId: string
  playerKey: string
  playerName: string
  position: number
  totalPoints: number
  achievementPoints: number
  specialLeaguePoints: number
}

export function getLeagueDates(
  tournaments: Tournament[],
  leaguePeriodId: string,
): Tournament[] {
  return tournaments
    .filter(
      (tournament) =>
        tournament.type === 'league_date' && tournament.leaguePeriodId === leaguePeriodId,
    )
    .sort(
      (first, second) =>
        first.date.localeCompare(second.date) || first.createdAt.localeCompare(second.createdAt),
    )
}

export function getIndependentEvents(tournaments: Tournament[]): Tournament[] {
  return tournaments
    .filter((tournament) => tournament.type === 'independent')
    .sort(
      (first, second) =>
        second.date.localeCompare(first.date) || second.createdAt.localeCompare(first.createdAt),
    )
}

export function getLeaguePeriodsByStatus(
  leaguePeriods: LeaguePeriod[],
  status: LeaguePeriod['status'],
): LeaguePeriod[] {
  return leaguePeriods
    .filter((leaguePeriod) => leaguePeriod.status === status)
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
}

export function deriveTournamentWinner(tournament: Tournament): TournamentWinner | null {
  if (tournament.status !== 'finished') return null
  return deriveTournamentTop(tournament, 1)[0] ?? null
}

export function deriveTournamentTop(
  tournament: Tournament,
  limit = 3,
): TournamentWinner[] {
  if (tournament.status !== 'finished' || limit < 1) return []
  return calculateTournamentStanding(tournament)
    .slice(0, limit)
    .flatMap((entry) => {
      const participant = tournament.participants.find((item) => item.id === entry.participantId)
      return participant
        ? [{ ...entry, playerKey: participant.playerKey, playerName: participant.name }]
        : []
    })
}

export function countLeagueParticipations(tournaments: Tournament[], leaguePeriodId: string): number {
  return getLeagueDates(tournaments, leaguePeriodId).reduce(
    (total, tournament) =>
      total + tournament.participants.filter((participant) => !participant.isGhost).length,
    0,
  )
}
