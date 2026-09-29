import { DomainError } from './errors'
import { buildTheoreticalLeagueLeaderboard, buildTournamentFinancialDifferences } from './league'
import { calculateLeaguePoolSummary, calculatePrizeDistribution } from './prizes'
import type {
  IdFactory,
  LeaguePeriod,
  LeaguePrizeLedger,
  Tournament,
  TournamentPenaltyDefinition,
  TournamentPenaltyMovement,
} from './tournament'
import { createId } from '../utils/id'

export interface TournamentPenaltyFinancialContext {
  ledger: LeaguePrizeLedger
  leaguePeriod?: LeaguePeriod
  tournaments: Tournament[]
}

function theoreticalDateAwards(
  tournament: Tournament,
  context: TournamentPenaltyFinancialContext,
): Map<string, number> {
  return new Map(buildTournamentFinancialDifferences(
    tournament, context.ledger, context.leaguePeriod,
  ).map((difference) => [difference.playerKey, difference.theoretical]))
}

function theoreticalMonthlyAwards(
  tournament: Tournament,
  context: TournamentPenaltyFinancialContext,
): Map<string, number> {
  const league = context.leaguePeriod
  if (!league) return new Map()
  const tournaments = context.tournaments.map((item) =>
    item.id === tournament.id ? tournament : item,
  )
  const pool = league.finalizedMonthlyPool ?? calculateLeaguePoolSummary(
    context.ledger.contributions, league.id,
  ).monthlyFinalizedPool
  const distribution = pool > 0
    ? calculatePrizeDistribution(pool, league.monthlyPrizePercentages)
    : []
  const ranking = buildTheoreticalLeagueLeaderboard(
    tournaments,
    { ...league, administrativeLeaderboardPlayerKeys: undefined },
    context.ledger,
  )
  return new Map(ranking.map((entry, index) => [
    entry.playerKey, distribution[index] ?? 0,
  ]))
}

function amountsChanged(first: Map<string, number>, second: Map<string, number>): boolean {
  return [...new Set([...first.keys(), ...second.keys()])]
    .some((key) => (first.get(key) ?? 0) !== (second.get(key) ?? 0))
}

export function penaltyChangesConsolidatedCredit(
  before: Tournament,
  after: Tournament,
  context: TournamentPenaltyFinancialContext,
): boolean {
  if (before.prizeMode === 'none') return false
  const dateCreditExists = context.ledger.creditMovements.some((movement) =>
    movement.tournamentId === before.id && movement.type === 'date_prize' && movement.status === 'active',
  )
  if (dateCreditExists && amountsChanged(
    theoreticalDateAwards(before, context), theoreticalDateAwards(after, context),
  )) return true

  const monthlyCreditExists = context.leaguePeriod && context.ledger.creditMovements.some((movement) =>
    movement.leaguePeriodId === context.leaguePeriod!.id &&
    movement.type === 'month_prize' && movement.status === 'active',
  )
  return Boolean(monthlyCreditExists && amountsChanged(
    theoreticalMonthlyAwards(before, context), theoreticalMonthlyAwards(after, context),
  ))
}

function withPenaltyMovement(
  tournament: Tournament,
  movements: TournamentPenaltyMovement[],
  context: TournamentPenaltyFinancialContext,
  now: string,
): Tournament {
  const next: Tournament = {
    ...tournament,
    penaltyMovements: movements,
    administrativeStandingParticipantIds: undefined,
    updatedAt: now,
  }
  const financialImpact = penaltyChangesConsolidatedCredit(tournament, next, context)
  return financialImpact ? {
    ...next,
    financialReviewRequired: true,
    financialReviewResolvedAt: undefined,
  } : next
}

export function applyTournamentPenalty(
  tournament: Tournament,
  playerKey: string,
  definition: TournamentPenaltyDefinition,
  context: TournamentPenaltyFinancialContext,
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): Tournament {
  if (!tournament.participants.some((participant) =>
    participant.playerKey === playerKey && !participant.isGhost,
  )) throw new DomainError('La penalización debe pertenecer a un jugador real del torneo.')
  if (!definition.active) throw new DomainError('La penalización ya no está disponible para nuevos registros.')
  if (!Number.isInteger(definition.points) || definition.points >= 0) {
    throw new DomainError('La penalización debe ser un entero negativo.')
  }
  const movement: TournamentPenaltyMovement = {
    id: idFactory('tournament-penalty'),
    tournamentId: tournament.id,
    playerKey,
    sourceDefinitionId: definition.id,
    name: definition.name,
    description: definition.description,
    amount: definition.points,
    createdAt: now,
    status: 'active',
  }
  return withPenaltyMovement(
    tournament, [...tournament.penaltyMovements, movement], context, now,
  )
}

export function voidTournamentPenalty(
  tournament: Tournament,
  movementId: string,
  context: TournamentPenaltyFinancialContext,
  now = new Date().toISOString(),
): Tournament {
  const movement = tournament.penaltyMovements.find((item) => item.id === movementId)
  if (!movement || movement.status !== 'active' || movement.tournamentId !== tournament.id) {
    throw new DomainError('No se encontró una penalización activa para anular.')
  }
  return withPenaltyMovement(tournament, tournament.penaltyMovements.map((item) =>
    item.id === movementId ? { ...item, status: 'void' as const, voidedAt: now } : item,
  ), context, now)
}
