import { DomainError } from './errors'
import {
  cloneAchievementConfig,
  DEFAULT_ACHIEVEMENT_CONFIG,
  DEFAULT_ROTATING_ACHIEVEMENTS,
  MAX_ROTATING_ACHIEVEMENTS,
  validateAchievementConfig,
} from './achievements'
import type {
  CreditPrizeConfig,
  IdFactory,
  LeagueContributionConfig,
  LeaguePeriod,
  LeaguePoolContribution,
  LeaguePrizeLedger,
  Tournament,
} from './tournament'
import { createId } from '../utils/id'

export const DEFAULT_LEAGUE_CONTRIBUTION_CONFIG: LeagueContributionConfig = {
  contributionPerPlayer: 4000,
  dateContributionPerPlayer: 2000,
  monthlyContributionPerPlayer: 2000,
}

export const DEFAULT_PRIZE_PERCENTAGES = [50, 30, 20]

export type LeagueContributionField = keyof LeagueContributionConfig

function nonNegativeAmount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export function rebalanceLeagueContribution(
  config: LeagueContributionConfig,
  changedField: LeagueContributionField,
  rawValue: number,
): LeagueContributionConfig {
  const value = nonNegativeAmount(rawValue)
  if (changedField === 'contributionPerPlayer') {
    const dateContributionPerPlayer = Math.min(
      nonNegativeAmount(config.dateContributionPerPlayer),
      value,
    )
    return {
      contributionPerPlayer: value,
      dateContributionPerPlayer,
      monthlyContributionPerPlayer: value - dateContributionPerPlayer,
    }
  }

  const total = nonNegativeAmount(config.contributionPerPlayer)
  if (changedField === 'dateContributionPerPlayer') {
    const dateContributionPerPlayer = Math.min(value, total)
    return {
      contributionPerPlayer: total,
      dateContributionPerPlayer,
      monthlyContributionPerPlayer: total - dateContributionPerPlayer,
    }
  }

  const monthlyContributionPerPlayer = Math.min(value, total)
  return {
    contributionPerPlayer: total,
    dateContributionPerPlayer: total - monthlyContributionPerPlayer,
    monthlyContributionPerPlayer,
  }
}

export interface TournamentPrizeSummary {
  prizePlayerCount: number
  datePrizePool: number
  monthlyPoolContribution: number
  totalGenerated: number
  percentagesByPosition: number[]
}

export interface LeaguePoolSummary {
  monthlyFinalizedPool: number
  monthlyProjectedPool: number
}

export interface LateRegistrationPrizeIncrease {
  playerCount: number
  datePoolIncrease: number
  monthlyPoolIncrease: number
  totalIncrease: number
}

function validatePercentages(percentages: number[], label: string): string[] {
  if (percentages.length === 0) return [`${label}: agrega al menos una posición.`]
  if (percentages.some((percentage) => !Number.isFinite(percentage) || percentage < 0)) {
    return [`${label}: los porcentajes deben ser números iguales o mayores a 0.`]
  }
  const total = percentages.reduce((sum, percentage) => sum + percentage, 0)
  return Math.abs(total - 100) > 0.001 ? [`${label}: los porcentajes deben sumar 100.`] : []
}

export function validateLeaguePeriod(leaguePeriod: LeaguePeriod): string[] {
  const errors: string[] = []
  const config = leaguePeriod.contributionConfig
  if (!leaguePeriod.name.trim()) errors.push('El nombre de la liga es obligatorio.')
  if (!leaguePeriod.startDate || !leaguePeriod.endDate) {
    errors.push('Las fechas de inicio y término de la liga son obligatorias.')
  } else if (leaguePeriod.endDate < leaguePeriod.startDate) {
    errors.push('La fecha de término no puede ser anterior a la fecha de inicio.')
  }
  if (
    [
      config.contributionPerPlayer,
      config.dateContributionPerPlayer,
      config.monthlyContributionPerPlayer,
    ].some((amount) => !Number.isFinite(amount) || amount < 0)
  ) {
    errors.push('Los aportes por jugador deben ser números iguales o mayores a 0.')
  }
  if (
    config.dateContributionPerPlayer + config.monthlyContributionPerPlayer !==
    config.contributionPerPlayer
  ) {
    errors.push('El aporte de fecha más el aporte mensual debe ser igual al aporte total.')
  }
  errors.push(...validatePercentages(leaguePeriod.datePrizePercentages, 'Distribución del pozo de la fecha'))
  errors.push(...validatePercentages(leaguePeriod.monthlyPrizePercentages, 'Distribución del pozo mensual'))
  try {
    validateAchievementConfig(leaguePeriod.defaultAchievementConfig)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'La configuración de logros no es válida.')
  }
  if (
    leaguePeriod.defaultRotatingAchievements.length < 1 ||
    leaguePeriod.defaultRotatingAchievements.length > MAX_ROTATING_ACHIEVEMENTS ||
    leaguePeriod.defaultRotatingAchievements.some((achievement) => !achievement.label.trim())
  ) {
    errors.push(`La liga debe tener entre 1 y ${MAX_ROTATING_ACHIEVEMENTS} logros rotativos con nombre.`)
  }
  return errors
}

export function createDefaultLeaguePeriod(
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): LeaguePeriod {
  const currentDate = now.slice(0, 10)
  return {
    id: idFactory('league-period'),
    name: 'Liga Commander · Período actual',
    startDate: currentDate,
    endDate: currentDate,
    status: 'active',
    contributionConfig: { ...DEFAULT_LEAGUE_CONTRIBUTION_CONFIG },
    datePrizePercentages: [...DEFAULT_PRIZE_PERCENTAGES],
    monthlyPrizePercentages: [...DEFAULT_PRIZE_PERCENTAGES],
    defaultAchievementConfig: cloneAchievementConfig(DEFAULT_ACHIEVEMENT_CONFIG),
    defaultRotatingAchievements: DEFAULT_ROTATING_ACHIEVEMENTS.map((achievement) => ({
      ...achievement,
    })),
    createdAt: now,
    updatedAt: now,
    reviewRequired: false,
    financialReviewRequired: false,
    wasReopened: false,
  }
}

export function createDefaultLeaguePrizeLedger(
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): LeaguePrizeLedger {
  return {
    leaguePeriods: [createDefaultLeaguePeriod(idFactory, now)],
    contributions: [],
    creditMovements: [],
    specialPointMovements: [],
    championSnapshots: [],
  }
}

export function addLeaguePeriod(
  ledger: LeaguePrizeLedger,
  leaguePeriod: LeaguePeriod,
): LeaguePrizeLedger {
  const errors = validateLeaguePeriod(leaguePeriod)
  if (errors.length > 0) throw new DomainError(errors.join(' '))
  if (ledger.leaguePeriods.some((period) => period.id === leaguePeriod.id)) {
    throw new DomainError('Ya existe una liga con este identificador.')
  }
  return {
    ...ledger,
    leaguePeriods: [
      ...ledger.leaguePeriods,
      {
        ...leaguePeriod,
        name: leaguePeriod.name.trim(),
        defaultAchievementConfig: cloneAchievementConfig(
          leaguePeriod.defaultAchievementConfig,
        ),
        defaultRotatingAchievements: leaguePeriod.defaultRotatingAchievements.map(
          (achievement) => ({ ...achievement }),
        ),
      },
    ],
  }
}

export interface LeaguePeriodUpdateOptions {
  confirmFinishedSensitiveChange?: boolean
}

function sensitiveLeagueConfigurationChanged(
  current: LeaguePeriod,
  next: LeaguePeriod,
): boolean {
  return (
    JSON.stringify(current.contributionConfig) !== JSON.stringify(next.contributionConfig) ||
    JSON.stringify(current.datePrizePercentages) !== JSON.stringify(next.datePrizePercentages) ||
    JSON.stringify(current.monthlyPrizePercentages) !== JSON.stringify(next.monthlyPrizePercentages) ||
    JSON.stringify(current.defaultAchievementConfig) !==
      JSON.stringify(next.defaultAchievementConfig) ||
    JSON.stringify(current.defaultRotatingAchievements) !==
      JSON.stringify(next.defaultRotatingAchievements)
  )
}

export function updateLeaguePeriod(
  ledger: LeaguePrizeLedger,
  updatedLeaguePeriod: LeaguePeriod,
  options: LeaguePeriodUpdateOptions = {},
): LeaguePrizeLedger {
  const errors = validateLeaguePeriod(updatedLeaguePeriod)
  if (errors.length > 0) throw new DomainError(errors.join(' '))
  const currentLeaguePeriod = ledger.leaguePeriods.find(
    (period) => period.id === updatedLeaguePeriod.id,
  )
  if (!currentLeaguePeriod) {
    throw new DomainError('No se encontró el período de liga.')
  }
  const sensitiveChange = sensitiveLeagueConfigurationChanged(
    currentLeaguePeriod,
    updatedLeaguePeriod,
  )
  if (
    currentLeaguePeriod.status === 'finished' &&
    sensitiveChange &&
    !options.confirmFinishedSensitiveChange
  ) {
    throw new DomainError(
      'Estás modificando una liga finalizada. Confirma el cambio administrativo; los datos financieros consolidados no se recalcularán.',
    )
  }
  const leaguePeriod = {
    ...updatedLeaguePeriod,
    name: updatedLeaguePeriod.name.trim(),
    defaultAchievementConfig: cloneAchievementConfig(
      updatedLeaguePeriod.defaultAchievementConfig,
    ),
    reviewRequired:
      currentLeaguePeriod.status === 'finished' && sensitiveChange
        ? true
        : updatedLeaguePeriod.reviewRequired,
    financialReviewRequired:
      currentLeaguePeriod.status === 'finished' && sensitiveChange
        ? true
        : updatedLeaguePeriod.financialReviewRequired,
    updatedAt: new Date().toISOString(),
  }
  const updatedLedger = {
    ...ledger,
    leaguePeriods: ledger.leaguePeriods.map((period) =>
      period.id === leaguePeriod.id ? leaguePeriod : period,
    ),
  }
  return currentLeaguePeriod.status === 'finished'
    ? updatedLedger
    : recalculateLeagueContributions(updatedLedger, leaguePeriod)
}

export function calculatePrizeDistribution(
  prizePool: number,
  percentagesByPosition: number[],
): number[] {
  if (!Number.isFinite(prizePool) || prizePool < 0) {
    throw new DomainError('El pozo no puede ser negativo.')
  }
  const errors = prizePool > 0 ? validatePercentages(percentagesByPosition, 'Distribución del pozo') : []
  if (errors.length > 0) throw new DomainError(errors.join(' '))
  return percentagesByPosition.map((percentage) => (prizePool * percentage) / 100)
}

export function calculateTournamentPrizeSummary(
  tournament: Tournament,
  leaguePeriod?: LeaguePeriod,
): TournamentPrizeSummary {
  if (tournament.prizeMode === 'none') {
    return {
      prizePlayerCount: tournament.prizePlayerCount,
      datePrizePool: 0,
      monthlyPoolContribution: 0,
      totalGenerated: 0,
      percentagesByPosition: [],
    }
  }

  if (tournament.prizeMode === 'manual_credit') {
    return {
      prizePlayerCount: tournament.prizePlayerCount,
      datePrizePool: tournament.dateCreditConfig.prizePool,
      monthlyPoolContribution: 0,
      totalGenerated: tournament.dateCreditConfig.prizePool,
      percentagesByPosition: [...tournament.dateCreditConfig.percentagesByPosition],
    }
  }

  if (!leaguePeriod || tournament.leaguePeriodId !== leaguePeriod.id) {
    throw new DomainError('La fecha de liga necesita un período de liga válido.')
  }
  const config = leaguePeriod.contributionConfig
  const datePrizePool = tournament.prizePlayerCount * config.dateContributionPerPlayer
  const monthlyPoolContribution =
    tournament.prizePlayerCount * config.monthlyContributionPerPlayer
  return {
    prizePlayerCount: tournament.prizePlayerCount,
    datePrizePool,
    monthlyPoolContribution,
    totalGenerated: datePrizePool + monthlyPoolContribution,
    percentagesByPosition: [...leaguePeriod.datePrizePercentages],
  }
}

export function syncSetupPrizeParticipants(tournament: Tournament): Tournament {
  if (tournament.status !== 'setup') return tournament
  const prizeParticipantIds = tournament.participants
    .filter((participant) => !participant.isGhost)
    .map((participant) => participant.id)
  if (
    tournament.prizePlayerCount === prizeParticipantIds.length &&
    tournament.prizeParticipantIds.length === prizeParticipantIds.length &&
    tournament.prizeParticipantIds.every((id, index) => id === prizeParticipantIds[index])
  ) {
    return tournament
  }
  return {
    ...tournament,
    prizePlayerCount: prizeParticipantIds.length,
    prizeParticipantIds,
  }
}

export function confirmLateRegistrationPrizePlayers(
  tournament: Tournament,
  participantIds: string[],
): Tournament {
  if (tournament.status === 'setup') return syncSetupPrizeParticipants(tournament)
  if (tournament.prizeMode !== 'league_auto') {
    throw new DomainError('La confirmación de aporte tardío solo aplica a fechas de liga.')
  }
  const knownParticipantIds = new Set(
    tournament.participants
      .filter((participant) => !participant.isGhost)
      .map((participant) => participant.id),
  )
  if (participantIds.some((participantId) => !knownParticipantIds.has(participantId))) {
    throw new DomainError('Todos los jugadores tardíos deben pertenecer al torneo.')
  }
  const currentIds = new Set(tournament.prizeParticipantIds)
  participantIds.forEach((participantId) => currentIds.add(participantId))
  const prizeParticipantIds = [...currentIds]
  return {
    ...tournament,
    prizeParticipantIds,
    prizePlayerCount: prizeParticipantIds.length,
    updatedAt: new Date().toISOString(),
  }
}

export function calculateLateRegistrationIncrease(
  playerCount: number,
  leaguePeriod: LeaguePeriod,
): LateRegistrationPrizeIncrease {
  if (!Number.isInteger(playerCount) || playerCount < 1) {
    throw new DomainError('Debe existir al menos un jugador tardío para calcular el aporte.')
  }
  const datePoolIncrease =
    playerCount * leaguePeriod.contributionConfig.dateContributionPerPlayer
  const monthlyPoolIncrease =
    playerCount * leaguePeriod.contributionConfig.monthlyContributionPerPlayer
  return {
    playerCount,
    datePoolIncrease,
    monthlyPoolIncrease,
    totalIncrease: datePoolIncrease + monthlyPoolIncrease,
  }
}

function contributionStatus(tournament: Tournament): LeaguePoolContribution['status'] {
  return tournament.status === 'finished' ? 'finalized' : 'projected'
}

export function upsertLeaguePoolContribution(
  ledger: LeaguePrizeLedger,
  tournament: Tournament,
  leaguePeriod: LeaguePeriod,
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): LeaguePrizeLedger {
  if (tournament.prizeMode !== 'league_auto') return ledger
  const summary = calculateTournamentPrizeSummary(tournament, leaguePeriod)
  const existing = ledger.contributions.find(
    (contribution) => contribution.tournamentId === tournament.id,
  )
  const status = contributionStatus(tournament)
  const next: LeaguePoolContribution = {
    id: existing?.id ?? idFactory('league-contribution'),
    leaguePeriodId: leaguePeriod.id,
    tournamentId: tournament.id,
    playerCount: summary.prizePlayerCount,
    datePoolAmount: summary.datePrizePool,
    monthlyPoolContribution: summary.monthlyPoolContribution,
    status,
    createdAt: existing?.createdAt ?? now,
    finalizedAt: status === 'finalized' ? existing?.finalizedAt ?? now : undefined,
  }
  const unchanged =
    existing &&
    existing.leaguePeriodId === next.leaguePeriodId &&
    existing.playerCount === next.playerCount &&
    existing.datePoolAmount === next.datePoolAmount &&
    existing.monthlyPoolContribution === next.monthlyPoolContribution &&
    existing.status === next.status &&
    existing.finalizedAt === next.finalizedAt &&
    ledger.contributions.filter((item) => item.tournamentId === tournament.id).length === 1
  if (unchanged) return ledger
  return {
    ...ledger,
    contributions: [
      ...ledger.contributions.filter((item) => item.tournamentId !== tournament.id),
      next,
    ],
  }
}

export function recalculateLeagueContributions(
  ledger: LeaguePrizeLedger,
  leaguePeriod: LeaguePeriod,
): LeaguePrizeLedger {
  const config = leaguePeriod.contributionConfig
  return {
    ...ledger,
    contributions: ledger.contributions.map((contribution) =>
      contribution.leaguePeriodId === leaguePeriod.id
        ? {
            ...contribution,
            datePoolAmount: contribution.playerCount * config.dateContributionPerPlayer,
            monthlyPoolContribution:
              contribution.playerCount * config.monthlyContributionPerPlayer,
          }
        : contribution,
    ),
  }
}

export function removeProjectedContribution(
  ledger: LeaguePrizeLedger,
  tournamentId: string,
): LeaguePrizeLedger {
  const hasProjectedContribution = ledger.contributions.some(
    (contribution) =>
      contribution.tournamentId === tournamentId && contribution.status === 'projected',
  )
  if (!hasProjectedContribution) return ledger
  return {
    ...ledger,
    contributions: ledger.contributions.filter(
      (contribution) =>
        contribution.tournamentId !== tournamentId || contribution.status === 'finalized',
    ),
  }
}

export function calculateLeaguePoolSummary(
  contributions: LeaguePoolContribution[],
  leaguePeriodId: string,
): LeaguePoolSummary {
  return contributions
    .filter((contribution) => contribution.leaguePeriodId === leaguePeriodId)
    .reduce(
      (summary, contribution) => ({
        monthlyFinalizedPool:
          summary.monthlyFinalizedPool +
          (contribution.status === 'finalized' ? contribution.monthlyPoolContribution : 0),
        monthlyProjectedPool:
          summary.monthlyProjectedPool + contribution.monthlyPoolContribution,
      }),
      { monthlyFinalizedPool: 0, monthlyProjectedPool: 0 },
    )
}

export function manualCreditConfig(
  prizePool: number,
  percentagesByPosition: number[],
): CreditPrizeConfig {
  return { prizePool, percentagesByPosition: [...percentagesByPosition] }
}
