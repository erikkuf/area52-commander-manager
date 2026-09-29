import { getCommittedTableResults } from './results'
import { calculateAchievementCount } from './achievements'
import type { Tournament } from './tournament'

export interface TournamentStandingEntry {
  participantId: string
  position: number
  achievementPoints: number
  achievementCount: number
  penaltyPoints: number
  specialLeaguePoints: number
  totalPoints: number
  savedTables: number
  tableWins: number
  eliminations: number
}

export function compareTournamentStandingMetrics(
  first: Pick<TournamentStandingEntry, 'totalPoints' | 'tableWins' | 'achievementCount' | 'eliminations'>,
  second: Pick<TournamentStandingEntry, 'totalPoints' | 'tableWins' | 'achievementCount' | 'eliminations'>,
): number {
  return (
    second.totalPoints - first.totalPoints ||
    second.tableWins - first.tableWins ||
    second.achievementCount - first.achievementCount ||
    second.eliminations - first.eliminations
  )
}

function buildTournamentStanding(
  tournament: Tournament,
  useAdministrativeResolution: boolean,
): TournamentStandingEntry[] {
  const totals = new Map(
    tournament.participants.filter((participant) => !participant.isGhost).map((participant) => [
      participant.id,
      {
        participantId: participant.id,
        achievementPoints: 0,
        achievementCount: 0,
        penaltyPoints: 0,
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
        entry.achievementCount += calculateAchievementCount(
          result,
          tournament.achievementConfig,
          tournament.rotatingAchievements,
        )
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

  const participantIdByPlayerKey = new Map(
    tournament.participants.filter((participant) => !participant.isGhost)
      .map((participant) => [participant.playerKey, participant.id]),
  )
  ;(tournament.penaltyMovements ?? []).forEach((movement) => {
    if (movement.status !== 'active' || movement.tournamentId !== tournament.id) return
    const participantId = participantIdByPlayerKey.get(movement.playerKey)
    const entry = participantId ? totals.get(participantId) : undefined
    if (!entry) return
    entry.penaltyPoints += movement.amount
    entry.totalPoints += movement.amount
  })

  const names = new Map(
    tournament.participants.map((participant) => [participant.id, participant.name]),
  )
  const administrativeOrder = new Map(
    (useAdministrativeResolution
      ? tournament.administrativeStandingParticipantIds ?? []
      : []
    ).map((participantId, index) => [participantId, index]),
  )
  return [...totals.values()]
    .sort(
      (first, second) => {
        const competitiveDifference = compareTournamentStandingMetrics(first, second)
        if (competitiveDifference !== 0) return competitiveDifference
        const firstAdministrativePosition = administrativeOrder.get(first.participantId)
        const secondAdministrativePosition = administrativeOrder.get(second.participantId)
        if (
          firstAdministrativePosition !== undefined &&
          secondAdministrativePosition !== undefined &&
          firstAdministrativePosition !== secondAdministrativePosition
        ) {
          return firstAdministrativePosition - secondAdministrativePosition
        }
        return (names.get(first.participantId) ?? '').localeCompare(
          names.get(second.participantId) ?? '',
          'es-CL',
        ) || first.participantId.localeCompare(second.participantId)
      },
    )
    .map((entry, index) => ({ ...entry, position: index + 1 }))
}

export function calculateTournamentStanding(tournament: Tournament): TournamentStandingEntry[] {
  return buildTournamentStanding(tournament, true)
}

export function calculateTheoreticalTournamentStanding(
  tournament: Tournament,
): TournamentStandingEntry[] {
  return buildTournamentStanding(tournament, false)
}

export function getExactTournamentStandingTieGroups(
  tournament: Tournament,
): TournamentStandingEntry[][] {
  const standing = calculateTheoreticalTournamentStanding(tournament)
  const groups: TournamentStandingEntry[][] = []
  standing.forEach((entry) => {
    const currentGroup = groups.at(-1)
    if (
      currentGroup &&
      compareTournamentStandingMetrics(currentGroup[0], entry) === 0
    ) {
      currentGroup.push(entry)
    } else {
      groups.push([entry])
    }
  })
  return groups.filter((group) => group.length > 1)
}

export function normalizeAdministrativeStandingOrder(
  tournament: Tournament,
  proposedOrder?: string[],
): string[] | undefined {
  const tieGroups = getExactTournamentStandingTieGroups(tournament)
  if (tieGroups.length === 0) return undefined
  if (!proposedOrder) return undefined

  const proposedPositions = new Map(
    proposedOrder.map((participantId, index) => [participantId, index]),
  )
  const tiedParticipantIds = tieGroups.flatMap((group) =>
    group.map((entry) => entry.participantId),
  )
  if (tiedParticipantIds.some((participantId) => !proposedPositions.has(participantId))) {
    return undefined
  }
  return tieGroups.flatMap((group) =>
    group
      .slice()
      .sort(
        (first, second) =>
          proposedPositions.get(first.participantId)! -
          proposedPositions.get(second.participantId)!,
      )
      .map((entry) => entry.participantId),
  )
}

/** @deprecated Usa calculateTournamentStanding para clasificaciones de un evento. */
export const calculateLeaderboard = calculateTournamentStanding
/** @deprecated Usa TournamentStandingEntry. */
export type LeaderboardEntry = TournamentStandingEntry
