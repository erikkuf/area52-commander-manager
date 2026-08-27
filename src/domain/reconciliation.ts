import { calculateAvailableCredit } from './credits'
import {
  buildLeagueDateCreditCorrections,
  buildLeagueFinancialDifferences,
  buildLeagueLeaderboard,
  buildTournamentFinancialDifferences,
} from './league'
import { getLeagueDates } from './catalog'
import type { LeaguePeriod, LeaguePrizeLedger, Tournament } from './tournament'

export interface LeagueReconciliationRow {
  playerKey: string
  playerName: string
  theoreticalDateCredit: number
  consolidatedDateCredit: number
  theoreticalMonthlyCredit: number
  consolidatedMonthlyCredit: number
  leagueUsage: number
  availableCredit: number
  difference: number
}

export interface LeagueReconciliation {
  rows: LeagueReconciliationRow[]
  theoreticalTotal: number
  consolidatedTotal: number
  differenceTotal: number
  missingDateCredit: number
  pendingDateCreditCorrectionCount: number
  pendingDateCreditIncrease: number
  pendingDateCreditDecrease: number
  leagueUsageTotal: number
}

export function buildLeagueReconciliation(
  tournaments: Tournament[],
  leaguePeriod: LeaguePeriod,
  ledger: LeaguePrizeLedger,
): LeagueReconciliation {
  const leaderboard = buildLeagueLeaderboard(
    tournaments,
    { ...leaguePeriod, status: 'active' },
    ledger,
  )
  const names = new Map(leaderboard.map((entry) => [entry.playerKey, entry.playerName]))
  const dateTheoretical = new Map<string, number>()
  const dateConsolidated = new Map<string, number>()
  getLeagueDates(tournaments, leaguePeriod.id).forEach((tournament) => {
    buildTournamentFinancialDifferences(tournament, ledger, leaguePeriod).forEach((difference) => {
      names.set(difference.playerKey, difference.playerName)
      dateTheoretical.set(
        difference.playerKey,
        (dateTheoretical.get(difference.playerKey) ?? 0) + difference.theoretical,
      )
      dateConsolidated.set(
        difference.playerKey,
        (dateConsolidated.get(difference.playerKey) ?? 0) + difference.consolidated,
      )
    })
  })
  const monthDifferences = buildLeagueFinancialDifferences(tournaments, leaguePeriod, ledger)
  const monthTheoretical = new Map(monthDifferences.map((difference) => [difference.playerKey, difference.theoretical]))
  const monthConsolidated = new Map(monthDifferences.map((difference) => [difference.playerKey, difference.consolidated]))
  monthDifferences.forEach((difference) => names.set(difference.playerKey, difference.playerName))
  const usage = new Map<string, number>()
  ledger.creditMovements
    .filter((movement) => movement.leaguePeriodId === leaguePeriod.id && movement.type === 'usage' && movement.status === 'active')
    .forEach((movement) => usage.set(
      movement.playerKey,
      (usage.get(movement.playerKey) ?? 0) + movement.amount,
    ))
  const playerKeys = new Set([
    ...names.keys(),
    ...dateTheoretical.keys(),
    ...dateConsolidated.keys(),
    ...monthTheoretical.keys(),
    ...monthConsolidated.keys(),
    ...usage.keys(),
  ])
  const rows = [...playerKeys].map((playerKey) => {
    const theoreticalDateCredit = dateTheoretical.get(playerKey) ?? 0
    const consolidatedDateCredit = dateConsolidated.get(playerKey) ?? 0
    const theoreticalMonthlyCredit = monthTheoretical.get(playerKey) ?? 0
    const consolidatedMonthlyCredit = monthConsolidated.get(playerKey) ?? 0
    const theoretical = theoreticalDateCredit + theoreticalMonthlyCredit
    const consolidated = consolidatedDateCredit + consolidatedMonthlyCredit
    return {
      playerKey,
      playerName: names.get(playerKey) ?? playerKey,
      theoreticalDateCredit,
      consolidatedDateCredit,
      theoreticalMonthlyCredit,
      consolidatedMonthlyCredit,
      leagueUsage: usage.get(playerKey) ?? 0,
      availableCredit: calculateAvailableCredit(ledger.creditMovements, playerKey),
      difference: theoretical - consolidated,
    }
  }).sort((first, second) =>
    Math.abs(second.difference) - Math.abs(first.difference) ||
    first.playerName.localeCompare(second.playerName, 'es-CL'),
  )
  const theoreticalTotal = rows.reduce((sum, row) => sum + row.theoreticalDateCredit + row.theoreticalMonthlyCredit, 0)
  const consolidatedTotal = rows.reduce((sum, row) => sum + row.consolidatedDateCredit + row.consolidatedMonthlyCredit, 0)
  const pendingDateCreditCorrections = buildLeagueDateCreditCorrections(
    tournaments,
    leaguePeriod,
    ledger,
  )
  const pendingDateCreditIncrease = pendingDateCreditCorrections
    .filter((correction) => correction.direction === 'positive')
    .reduce((sum, correction) => sum + correction.amount, 0)
  const pendingDateCreditDecrease = pendingDateCreditCorrections
    .filter((correction) => correction.direction === 'negative')
    .reduce((sum, correction) => sum + correction.amount, 0)
  const totalPositiveDateDifference = rows.reduce(
    (sum, row) => sum + Math.max(0, row.theoreticalDateCredit - row.consolidatedDateCredit),
    0,
  )
  return {
    rows,
    theoreticalTotal,
    consolidatedTotal,
    differenceTotal: theoreticalTotal - consolidatedTotal,
    missingDateCredit: Math.max(0, totalPositiveDateDifference - pendingDateCreditIncrease),
    pendingDateCreditCorrectionCount: pendingDateCreditCorrections.length,
    pendingDateCreditIncrease,
    pendingDateCreditDecrease,
    leagueUsageTotal: rows.reduce((sum, row) => sum + row.leagueUsage, 0),
  }
}
