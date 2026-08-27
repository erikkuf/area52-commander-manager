import { getCommittedTableResults } from './results'
import type { Tournament } from './tournament'

export interface TournamentStandingEntry {
  participantId: string
  position: number
  achievementPoints: number
  specialLeaguePoints: number
  totalPoints: number
  savedTables: number
  tableWins: number
  eliminations: number
}

export function calculateTournamentStanding(tournament: Tournament): TournamentStandingEntry[] {
  const totals = new Map(
    tournament.participants.filter((participant) => !participant.isGhost).map((participant) => [
      participant.id,
      {
        participantId: participant.id,
        achievementPoints: 0,
        specialLeaguePoints: 0,
        totalPoints: 0,
        savedTables: 0,
        tableWins: 0,
        eliminations: 0,
      },
    ]),
  )

  tournament.rounds.forEach((round) => {
    round.tables.forEach((table) => {
      getCommittedTableResults(table).forEach((result) => {
        const entry = totals.get(result.participantId)
        if (!entry) return
        entry.achievementPoints += result.achievementPoints
        entry.specialLeaguePoints += result.specialLeaguePoints
        // Alpha 0.1 ordena la fecha por logros. Los puntos especiales se mantienen
        // visibles y separados hasta definir la estrategia mensual en Sprint 4.
        entry.totalPoints = entry.achievementPoints
        entry.savedTables += 1
        entry.tableWins += result.wonTable ? 1 : 0
        entry.eliminations += result.eliminations
      })
    })
  })

  const names = new Map(
    tournament.participants.map((participant) => [participant.id, participant.name]),
  )
  return [...totals.values()]
    .sort(
      (first, second) =>
        second.totalPoints - first.totalPoints ||
        second.tableWins - first.tableWins ||
        second.achievementPoints - first.achievementPoints ||
        second.eliminations - first.eliminations ||
        (names.get(first.participantId) ?? '').localeCompare(
          names.get(second.participantId) ?? '',
          'es-CL',
        ) ||
        first.participantId.localeCompare(second.participantId),
    )
    .map((entry, index) => ({ ...entry, position: index + 1 }))
}

/** @deprecated Usa calculateTournamentStanding para clasificaciones de un evento. */
export const calculateLeaderboard = calculateTournamentStanding
/** @deprecated Usa TournamentStandingEntry. */
export type LeaderboardEntry = TournamentStandingEntry
