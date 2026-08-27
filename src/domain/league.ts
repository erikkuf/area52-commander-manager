import { DomainError } from './errors'
import { calculateTournamentStanding } from './leaderboard'
import {
  calculateLeaguePoolSummary,
  calculatePrizeDistribution,
  calculateTournamentPrizeSummary,
  upsertLeaguePoolContribution,
} from './prizes'
import type {
  CreditMovement,
  IdFactory,
  LeagueMonthlyAward,
  LeaguePeriod,
  LeaguePrizeLedger,
  Tournament,
} from './tournament'
import { createId } from '../utils/id'
import { getLeagueDates } from './catalog'
import { calculateSpecialLeaguePoints } from './specialPoints'
import {
  assessChampionSnapshotReadiness,
  createMissingLeagueChampionSnapshot,
} from './hallOfFame'

export interface LeagueLeaderboardEntry {
  playerKey: string
  playerName: string
  position: number
  leaguePoints: number
  achievementPoints: number
  specialLeaguePoints: number
  participations: number
  dateCreditEarned: number
  theoreticalDateCredit: number
  dateCreditDifference: number
  monthlyPrize: number
  monthlyPrizeStatus: 'projected' | 'final'
  totalCredit: number
  totalCreditStatus: 'projected' | 'final'
  tableWins: number
  eliminations: number
}

export interface FinancialCreditDifference {
  playerKey: string
  playerName: string
  consolidated: number
  theoretical: number
  difference: number
}

interface LeagueStandingAccumulator {
  playerKey: string
  playerName: string
  leaguePoints: number
  achievementPoints: number
  specialLeaguePoints: number
  participations: number
  dateCreditEarned: number
  theoreticalDateCredit: number
  tableWins: number
  eliminations: number
}

export interface DateCreditCorrection {
  tournamentId: string
  tournamentName: string
  leaguePeriodId?: string
  playerKey: string
  playerName: string
  consolidated: number
  theoretical: number
  difference: number
  amount: number
  direction: 'positive' | 'negative'
  sourceReference: string
}

function signedTournamentDateCreditAmount(movement: CreditMovement): number {
  if (movement.type === 'date_prize' || movement.type === 'positive_adjustment') {
    return movement.amount
  }
  if (movement.type === 'negative_adjustment') return -movement.amount
  return 0
}

function isTournamentDateCreditMovement(
  movement: CreditMovement,
  tournamentId: string,
): boolean {
  return movement.tournamentId === tournamentId &&
    movement.status === 'active' &&
    (
      movement.type === 'date_prize' ||
      movement.type === 'positive_adjustment' ||
      movement.type === 'negative_adjustment'
    )
}

function officialOrderIndex(leaguePeriod: LeaguePeriod, playerKey: string): number {
  const index = leaguePeriod.finalizedLeaderboardPlayerKeys?.indexOf(playerKey) ?? -1
  return index < 0 ? Number.MAX_SAFE_INTEGER : index
}

function administrativeOrderIndex(leaguePeriod: LeaguePeriod, playerKey: string): number {
  const index = leaguePeriod.administrativeLeaderboardPlayerKeys?.indexOf(playerKey) ?? -1
  return index < 0 ? Number.MAX_SAFE_INTEGER : index
}

export function haveEqualLeagueTieBreakers(
  first: LeagueLeaderboardEntry,
  second: LeagueLeaderboardEntry,
): boolean {
  return first.leaguePoints === second.leaguePoints &&
    first.tableWins === second.tableWins &&
    first.achievementPoints === second.achievementPoints &&
    first.eliminations === second.eliminations
}

export function findExactLeagueTieGroups(
  standings: LeagueLeaderboardEntry[],
): LeagueLeaderboardEntry[][] {
  const groups: LeagueLeaderboardEntry[][] = []
  standings.forEach((entry) => {
    const current = groups.at(-1)
    if (current && haveEqualLeagueTieBreakers(current[0], entry)) current.push(entry)
    else groups.push([entry])
  })
  return groups.filter((group) => group.length > 1)
}

interface LeagueLeaderboardBuildOptions {
  respectFinalizedOrder: boolean
}

function buildLeagueLeaderboardInternal(
  tournaments: Tournament[],
  leaguePeriod: LeaguePeriod,
  ledger: LeaguePrizeLedger,
  options: LeagueLeaderboardBuildOptions,
): LeagueLeaderboardEntry[] {
  const totals = new Map<string, LeagueStandingAccumulator>()

  getLeagueDates(tournaments, leaguePeriod.id).forEach((tournament) => {
    const participantsById = new Map(
      tournament.participants.map((participant) => [participant.id, participant]),
    )
    const tournamentEntries = calculateTournamentStanding(tournament)
    tournamentEntries.forEach((entry) => {
      const participant = participantsById.get(entry.participantId)
      if (!participant || participant.isGhost) return
      const current = totals.get(participant.playerKey) ?? {
        playerKey: participant.playerKey,
        playerName: participant.name,
        leaguePoints: 0,
        achievementPoints: 0,
        specialLeaguePoints: 0,
        participations: 0,
        dateCreditEarned: 0,
        theoreticalDateCredit: 0,
        tableWins: 0,
        eliminations: 0,
      }
      current.playerName = participant.name
      current.leaguePoints += entry.totalPoints
      current.achievementPoints += entry.achievementPoints
      current.participations += entry.savedTables > 0 ? 1 : 0
      current.tableWins += entry.tableWins
      current.eliminations += entry.eliminations
      totals.set(participant.playerKey, current)
    })
  })

  totals.forEach((entry) => {
    entry.specialLeaguePoints = calculateSpecialLeaguePoints(
      ledger.specialPointMovements,
      leaguePeriod.id,
      entry.playerKey,
    )
    entry.leaguePoints += entry.specialLeaguePoints
  })

  getLeagueDates(tournaments, leaguePeriod.id).forEach((tournament) => {
    buildTournamentFinancialDifferences(tournament, ledger, leaguePeriod).forEach((difference) => {
      const entry = totals.get(difference.playerKey)
      if (!entry) return
      entry.dateCreditEarned += difference.consolidated
      entry.theoreticalDateCredit += difference.theoretical
    })
  })

  const ordered = [...totals.values()].sort(
    (first, second) =>
      (options.respectFinalizedOrder && leaguePeriod.status === 'finished'
        ? officialOrderIndex(leaguePeriod, first.playerKey) -
          officialOrderIndex(leaguePeriod, second.playerKey)
        : 0) ||
      second.leaguePoints - first.leaguePoints ||
      second.tableWins - first.tableWins ||
      second.achievementPoints - first.achievementPoints ||
      second.eliminations - first.eliminations ||
      administrativeOrderIndex(leaguePeriod, first.playerKey) -
        administrativeOrderIndex(leaguePeriod, second.playerKey) ||
      first.playerName.localeCompare(second.playerName, 'es-CL') ||
      first.playerKey.localeCompare(second.playerKey),
  )

  const poolSummary = calculateLeaguePoolSummary(ledger.contributions, leaguePeriod.id)
  const monthlyPool =
    leaguePeriod.status === 'finished'
      ? leaguePeriod.finalizedMonthlyPool ?? poolSummary.monthlyFinalizedPool
      : poolSummary.monthlyProjectedPool
  const monthlyDistribution =
    monthlyPool > 0
      ? calculatePrizeDistribution(monthlyPool, leaguePeriod.monthlyPrizePercentages)
      : []
  const finalizedAwards = new Map(
    (leaguePeriod.finalizedMonthlyAwards ?? []).map((award) => [award.playerKey, award.amount]),
  )

  return ordered.map((entry, index) => {
    const monthlyPrize =
      leaguePeriod.status === 'finished'
        ? finalizedAwards.get(entry.playerKey) ?? 0
        : monthlyDistribution[index] ?? 0
    const monthlyPrizeStatus = leaguePeriod.status === 'finished' ? 'final' : 'projected'
    return {
      ...entry,
      position: index + 1,
      monthlyPrize,
      monthlyPrizeStatus,
      dateCreditDifference: entry.theoreticalDateCredit - entry.dateCreditEarned,
      totalCredit: entry.dateCreditEarned + monthlyPrize,
      totalCreditStatus: monthlyPrizeStatus,
    }
  })
}

export function buildLeagueLeaderboard(
  tournaments: Tournament[],
  leaguePeriod: LeaguePeriod,
  ledger: LeaguePrizeLedger,
): LeagueLeaderboardEntry[] {
  return buildLeagueLeaderboardInternal(tournaments, leaguePeriod, ledger, {
    respectFinalizedOrder: true,
  })
}

export function buildTheoreticalLeagueLeaderboard(
  tournaments: Tournament[],
  leaguePeriod: LeaguePeriod,
  ledger: LeaguePrizeLedger,
): LeagueLeaderboardEntry[] {
  return buildLeagueLeaderboardInternal(tournaments, leaguePeriod, ledger, {
    respectFinalizedOrder: false,
  })
}

function createMonthPrizeMovements(
  ledger: LeaguePrizeLedger,
  leaguePeriod: LeaguePeriod,
  awards: LeagueMonthlyAward[],
  namesByPlayerKey: Map<string, string>,
  idFactory: IdFactory,
  now: string,
): CreditMovement[] {
  const existingKeys = new Set(
    ledger.creditMovements
      .filter(
        (movement) =>
          movement.type === 'month_prize' && movement.leaguePeriodId === leaguePeriod.id,
      )
      .map((movement) => movement.playerKey),
  )
  const newMovements: CreditMovement[] = awards
    .filter((award) => award.amount > 0 && !existingKeys.has(award.playerKey))
    .map((award) => ({
      id: idFactory('credit-movement'),
      playerKey: award.playerKey,
      leaguePeriodId: leaguePeriod.id,
      type: 'month_prize',
      amount: award.amount,
      reason: `Crédito fin de liga · ${leaguePeriod.name} · ${award.position}° ${namesByPlayerKey.get(award.playerKey) ?? ''}`.trim(),
      createdAt: now,
      status: 'active',
    }))
  return [...ledger.creditMovements, ...newMovements]
}

export function finishLeaguePeriod(
  ledger: LeaguePrizeLedger,
  leaguePeriodId: string,
  tournaments: Tournament[],
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
  administrativeLeaderboardPlayerKeys?: string[],
): LeaguePrizeLedger {
  const leaguePeriod = ledger.leaguePeriods.find((period) => period.id === leaguePeriodId)
  if (!leaguePeriod) throw new DomainError('No se encontró la liga.')
  if (leaguePeriod.status === 'finished') return ledger

  const dates = getLeagueDates(tournaments, leaguePeriodId)
  if (dates.length === 0) throw new DomainError('La liga necesita al menos una fecha para finalizar.')
  if (dates.some((tournament) => tournament.status !== 'finished')) {
    throw new DomainError('Todas las fechas de la liga deben estar finalizadas antes de cerrar la competencia.')
  }

  let synchronizedLedger = synchronizeFinishedTournamentPrizes(ledger, dates)
  dates.forEach((tournament) => {
    synchronizedLedger = upsertLeaguePoolContribution(
      synchronizedLedger,
      tournament,
      leaguePeriod,
      idFactory,
      now,
    )
  })
  const periodWithTieBreak = administrativeLeaderboardPlayerKeys?.length
    ? { ...leaguePeriod, administrativeLeaderboardPlayerKeys }
    : leaguePeriod
  const standings = buildLeagueLeaderboard(dates, periodWithTieBreak, synchronizedLedger)
  const pool = calculateLeaguePoolSummary(
    synchronizedLedger.contributions,
    leaguePeriodId,
  ).monthlyFinalizedPool
  const distribution =
    pool > 0 ? calculatePrizeDistribution(pool, leaguePeriod.monthlyPrizePercentages) : []
  const awards: LeagueMonthlyAward[] = standings
    .map((entry, index) => ({
      playerKey: entry.playerKey,
      position: index + 1,
      amount: distribution[index] ?? 0,
    }))
    .filter((award) => award.amount > 0)
  const namesByPlayerKey = new Map(
    standings.map((entry) => [entry.playerKey, entry.playerName]),
  )
  const previouslyConsolidated = leaguePeriod.finalizedMonthlyAwards ?? []
  const hasPreviousConsolidation = previouslyConsolidated.length > 0
  const awardsChanged = hasPreviousConsolidation && JSON.stringify(previouslyConsolidated) !== JSON.stringify(awards)
  const finishedPeriod: LeaguePeriod = {
    ...leaguePeriod,
    status: 'finished',
    finishedAt: now,
    updatedAt: now,
    reviewRequired: leaguePeriod.reviewRequired ?? false,
    financialReviewRequired: leaguePeriod.financialReviewRequired || awardsChanged,
    finalizedMonthlyPool: pool,
    finalizedMonthlyAwards: hasPreviousConsolidation ? previouslyConsolidated : awards,
    latestTheoreticalMonthlyAwards: awards,
    finalizedLeaderboardPlayerKeys:
      leaguePeriod.finalizedLeaderboardPlayerKeys ?? standings.map((entry) => entry.playerKey),
    administrativeLeaderboardPlayerKeys:
      administrativeLeaderboardPlayerKeys ?? leaguePeriod.administrativeLeaderboardPlayerKeys,
  }

  const finishedLedger: LeaguePrizeLedger = {
    ...synchronizedLedger,
    leaguePeriods: synchronizedLedger.leaguePeriods.map((period) =>
      period.id === leaguePeriodId ? finishedPeriod : period,
    ),
    creditMovements: createMonthPrizeMovements(
      synchronizedLedger,
      leaguePeriod,
      awards,
      namesByPlayerKey,
      idFactory,
      now,
    ),
  }
  const championReadiness = assessChampionSnapshotReadiness(
    finishedPeriod,
    standings,
    dates,
  )
  return championReadiness.ready
    ? createMissingLeagueChampionSnapshot(
        finishedLedger,
        finishedPeriod,
        standings,
        dates,
        idFactory,
        now,
      )
    : finishedLedger
}

export function markLeagueReviewRequired(
  ledger: LeaguePrizeLedger,
  leaguePeriodId: string,
  now = new Date().toISOString(),
): LeaguePrizeLedger {
  const leaguePeriod = ledger.leaguePeriods.find((period) => period.id === leaguePeriodId)
  if (!leaguePeriod || leaguePeriod.financialReviewRequired) {
    return ledger
  }
  return {
    ...ledger,
    leaguePeriods: ledger.leaguePeriods.map((period) =>
      period.id === leaguePeriodId
        ? {
            ...period,
            reviewRequired: true,
            financialReviewRequired: true,
            financialReviewResolvedAt: undefined,
            financialReviewLastImpactAt: now,
            updatedAt: now,
          }
        : period,
    ),
  }
}

function latestIsoTimestamp(values: Array<string | undefined>): string | undefined {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1)
}

export function refreshLeagueFinancialReviewRequirements(
  ledger: LeaguePrizeLedger,
  tournaments: Tournament[],
): LeaguePrizeLedger {
  let changed = false
  const leaguePeriods = ledger.leaguePeriods.map((period) => {
    const specialPointImpact = latestIsoTimestamp(
      ledger.specialPointMovements
        .filter((movement) => movement.leaguePeriodId === period.id)
        .flatMap((movement) => [movement.createdAt, movement.voidedAt]),
    )
    const affectedTournaments = getLeagueDates(tournaments, period.id).filter(
      (tournament) => tournament.financialReviewRequired,
    )
    const tournamentImpact = latestIsoTimestamp(
      affectedTournaments.flatMap((tournament) => [
        tournament.updatedAt,
        ...tournament.rounds.map((round) => round.lastEditedAt),
      ]),
    )
    const latestImpact = latestIsoTimestamp([
      period.financialReviewLastImpactAt,
      specialPointImpact,
      tournamentImpact,
    ])
    const reviewBaseline = period.financialReviewResolvedAt ?? period.finishedAt
    const impactAfterResolution = Boolean(
      latestImpact && reviewBaseline && latestImpact > reviewBaseline,
    )
    const shouldRequireReview =
      period.financialReviewRequired ||
      affectedTournaments.length > 0 ||
      (period.status === 'finished' && impactAfterResolution)

    if (
      shouldRequireReview === period.financialReviewRequired &&
      latestImpact === period.financialReviewLastImpactAt
    ) {
      return period
    }
    changed = true
    return {
      ...period,
      reviewRequired: shouldRequireReview || period.reviewRequired,
      financialReviewRequired: shouldRequireReview,
      financialReviewResolvedAt: shouldRequireReview
        ? undefined
        : period.financialReviewResolvedAt,
      financialReviewLastImpactAt: latestImpact,
    }
  })
  return changed ? { ...ledger, leaguePeriods } : ledger
}

export function reopenLeaguePeriod(
  ledger: LeaguePrizeLedger,
  leaguePeriodId: string,
  now = new Date().toISOString(),
): LeaguePrizeLedger {
  const leaguePeriod = ledger.leaguePeriods.find((period) => period.id === leaguePeriodId)
  if (!leaguePeriod) throw new DomainError('No se encontró la liga.')
  if (leaguePeriod.status !== 'finished') return ledger
  return {
    ...ledger,
    leaguePeriods: ledger.leaguePeriods.map((period) =>
      period.id === leaguePeriodId
        ? {
            ...period,
            status: 'active',
            wasReopened: true,
            reopenedAt: now,
            updatedAt: now,
          }
        : period,
    ),
  }
}

export function resolveLeagueFinancialReview(
  ledger: LeaguePrizeLedger,
  leaguePeriodId: string,
  now = new Date().toISOString(),
): LeaguePrizeLedger {
  if (!ledger.leaguePeriods.some((period) => period.id === leaguePeriodId)) {
    throw new DomainError('No se encontró la liga.')
  }
  return {
    ...ledger,
    leaguePeriods: ledger.leaguePeriods.map((period) =>
      period.id === leaguePeriodId
        ? {
            ...period,
            reviewRequired: false,
            financialReviewRequired: false,
            financialReviewResolvedAt: now,
            updatedAt: now,
          }
        : period,
    ),
  }
}

export function buildLeagueFinancialDifferences(
  tournaments: Tournament[],
  leaguePeriod: LeaguePeriod,
  ledger: LeaguePrizeLedger,
): FinancialCreditDifference[] {
  const leaderboard = buildTheoreticalLeagueLeaderboard(tournaments, leaguePeriod, ledger)
  const pool = calculateLeaguePoolSummary(ledger.contributions, leaguePeriod.id).monthlyFinalizedPool
  const distribution = pool > 0
    ? calculatePrizeDistribution(pool, leaguePeriod.monthlyPrizePercentages)
    : []
  const names = new Map(leaderboard.map((entry) => [entry.playerKey, entry.playerName]))
  const theoretical = new Map(
    leaderboard.map((entry, index) => [entry.playerKey, distribution[index] ?? 0]),
  )
  const consolidated = new Map<string, number>()
  ledger.creditMovements
    .filter(
      (movement) =>
        movement.leaguePeriodId === leaguePeriod.id &&
        movement.type === 'month_prize' &&
        movement.status === 'active',
    )
    .forEach((movement) => {
      consolidated.set(
        movement.playerKey,
        (consolidated.get(movement.playerKey) ?? 0) + movement.amount,
      )
    })
  const playerKeys = new Set([...theoretical.keys(), ...consolidated.keys()])
  return [...playerKeys].map((playerKey) => {
    const consolidatedAmount = consolidated.get(playerKey) ?? 0
    const theoreticalAmount = theoretical.get(playerKey) ?? 0
    return {
      playerKey,
      playerName: names.get(playerKey) ?? playerKey,
      consolidated: consolidatedAmount,
      theoretical: theoreticalAmount,
      difference: theoreticalAmount - consolidatedAmount,
    }
  })
}

export function consolidateTournamentPrizes(
  ledger: LeaguePrizeLedger,
  tournament: Tournament,
  leaguePeriod?: LeaguePeriod,
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): LeaguePrizeLedger {
  if (tournament.status !== 'finished' || tournament.prizeMode === 'none') return ledger
  const standing = calculateTournamentStanding(tournament)
  const players = new Map(
    tournament.participants
      .filter((participant) => !participant.isGhost)
      .map((participant) => [participant.id, participant]),
  )
  const summary = calculateTournamentPrizeSummary(tournament, leaguePeriod)
  const distribution = summary.datePrizePool > 0
    ? calculatePrizeDistribution(summary.datePrizePool, summary.percentagesByPosition)
    : []
  const existingMovements = ledger.creditMovements.filter(
    (movement) => movement.type === 'date_prize' && movement.tournamentId === tournament.id,
  )
  const existingKeys = new Set(existingMovements.map((movement) => movement.playerKey))
  const expectedMovementCount = standing.filter(
    (entry) => (distribution[entry.position - 1] ?? 0) > 0,
  ).length

  // El crédito ya consolidado pertenece al jugador. Una corrección histórica puede
  // cambiar el Standing teórico, pero nunca debe reasignar o duplicar movimientos
  // automáticamente. La diferencia queda para el flujo de revisión financiera.
  if (
    existingMovements.length >= expectedMovementCount ||
    (existingMovements.length > 0 && tournament.financialReviewRequired)
  ) {
    return ledger
  }
  const additions: CreditMovement[] = standing.flatMap((entry) => {
    const participant = players.get(entry.participantId)
    const amount = distribution[entry.position - 1] ?? 0
    if (!participant || amount <= 0 || existingKeys.has(participant.playerKey)) return []
    return [{
      id: idFactory('credit-movement'),
      playerKey: participant.playerKey,
      tournamentId: tournament.id,
      leaguePeriodId: tournament.leaguePeriodId,
      type: 'date_prize' as const,
      amount,
      reason: `Crédito de fecha · ${tournament.name} · ${entry.position}° ${participant.name}`,
      createdAt: now,
      status: 'active' as const,
    }]
  })
  return additions.length === 0
    ? ledger
    : { ...ledger, creditMovements: [...ledger.creditMovements, ...additions] }
}

export function synchronizeFinishedTournamentPrizes(
  ledger: LeaguePrizeLedger,
  tournaments: Tournament[],
): LeaguePrizeLedger {
  return tournaments.reduce((current, tournament) => {
    if (tournament.status !== 'finished' || tournament.prizeMode === 'none') return current
    const leaguePeriod = current.leaguePeriods.find(
      (period) => period.id === tournament.leaguePeriodId,
    )
    return consolidateTournamentPrizes(current, tournament, leaguePeriod)
  }, ledger)
}

export function buildTournamentFinancialDifferences(
  tournament: Tournament,
  ledger: LeaguePrizeLedger,
  leaguePeriod?: LeaguePeriod,
): FinancialCreditDifference[] {
  const standing = calculateTournamentStanding(tournament)
  const summary = calculateTournamentPrizeSummary(tournament, leaguePeriod)
  const distribution = summary.datePrizePool > 0
    ? calculatePrizeDistribution(summary.datePrizePool, summary.percentagesByPosition)
    : []
  const players = new Map(tournament.participants.map((participant) => [participant.id, participant]))
  const theoretical = new Map<string, number>()
  const names = new Map<string, string>()
  standing.forEach((entry) => {
    const participant = players.get(entry.participantId)
    if (!participant || participant.isGhost) return
    names.set(participant.playerKey, participant.name)
    theoretical.set(participant.playerKey, distribution[entry.position - 1] ?? 0)
  })
  const consolidated = new Map<string, number>()
  ledger.creditMovements
    .filter((movement) => isTournamentDateCreditMovement(movement, tournament.id))
    .forEach((movement) => {
      consolidated.set(
        movement.playerKey,
        (consolidated.get(movement.playerKey) ?? 0) +
          signedTournamentDateCreditAmount(movement),
      )
    })
  return [...new Set([...theoretical.keys(), ...consolidated.keys()])].map((playerKey) => {
    const consolidatedAmount = consolidated.get(playerKey) ?? 0
    const theoreticalAmount = theoretical.get(playerKey) ?? 0
    return {
      playerKey,
      playerName: names.get(playerKey) ?? playerKey,
      consolidated: consolidatedAmount,
      theoretical: theoreticalAmount,
      difference: theoreticalAmount - consolidatedAmount,
    }
  })
}

export function buildTournamentDateCreditCorrections(
  tournament: Tournament,
  ledger: LeaguePrizeLedger,
  leaguePeriod?: LeaguePeriod,
): DateCreditCorrection[] {
  const hasConsolidatedPrize = ledger.creditMovements.some(
    (movement) =>
      movement.tournamentId === tournament.id &&
      movement.type === 'date_prize' &&
      movement.status === 'active',
  )
  if (!hasConsolidatedPrize) return []
  return buildTournamentFinancialDifferences(tournament, ledger, leaguePeriod)
    .filter((difference) => difference.difference !== 0)
    .map((difference) => ({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      leaguePeriodId: tournament.leaguePeriodId,
      playerKey: difference.playerKey,
      playerName: difference.playerName,
      consolidated: difference.consolidated,
      theoretical: difference.theoretical,
      difference: difference.difference,
      amount: Math.abs(difference.difference),
      direction: difference.difference > 0 ? 'positive' : 'negative',
      sourceReference:
        `date-credit-correction:${tournament.id}:${difference.playerKey}:` +
        `${difference.consolidated}:${difference.theoretical}`,
    }))
}

export function buildLeagueDateCreditCorrections(
  tournaments: Tournament[],
  leaguePeriod: LeaguePeriod,
  ledger: LeaguePrizeLedger,
): DateCreditCorrection[] {
  return getLeagueDates(tournaments, leaguePeriod.id).flatMap((tournament) =>
    buildTournamentDateCreditCorrections(tournament, ledger, leaguePeriod),
  )
}

function applyDateCreditCorrectionMovements(
  ledger: LeaguePrizeLedger,
  corrections: DateCreditCorrection[],
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): LeaguePrizeLedger {
  if (corrections.length === 0) return ledger
  const existingReferences = new Set(
    ledger.creditMovements
      .filter((movement) => movement.status === 'active')
      .map((movement) => movement.sourceReference)
      .filter((reference): reference is string => Boolean(reference)),
  )
  const additions: CreditMovement[] = corrections
    .filter((correction) => !existingReferences.has(correction.sourceReference))
    .map((correction) => ({
      id: idFactory('credit-movement'),
      playerKey: correction.playerKey,
      tournamentId: correction.tournamentId,
      leaguePeriodId: correction.leaguePeriodId,
      type: correction.direction === 'positive' ? 'positive_adjustment' : 'negative_adjustment',
      amount: correction.amount,
      reason:
        `Corrección de crédito · ${correction.tournamentName} · ` +
        `${correction.playerName}`,
      createdAt: now,
      status: 'active',
      sourceReference: correction.sourceReference,
    }))
  return additions.length === 0
    ? ledger
    : { ...ledger, creditMovements: [...ledger.creditMovements, ...additions] }
}

export function applyTournamentDateCreditCorrections(
  ledger: LeaguePrizeLedger,
  tournament: Tournament,
  leaguePeriod?: LeaguePeriod,
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): LeaguePrizeLedger {
  return applyDateCreditCorrectionMovements(
    ledger,
    buildTournamentDateCreditCorrections(tournament, ledger, leaguePeriod),
    idFactory,
    now,
  )
}

export function applyDateCreditCorrections(
  ledger: LeaguePrizeLedger,
  tournaments: Tournament[],
  leaguePeriod: LeaguePeriod,
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): LeaguePrizeLedger {
  return applyDateCreditCorrectionMovements(
    ledger,
    buildLeagueDateCreditCorrections(tournaments, leaguePeriod, ledger),
    idFactory,
    now,
  )
}
