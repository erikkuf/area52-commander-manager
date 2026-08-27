import { DomainError } from './errors'
import {
  achievementConfigsEqual,
  cloneAchievementConfig,
  DEFAULT_ACHIEVEMENT_CONFIG,
  recalculateTournamentAchievementPoints,
  tournamentHasRecordedResults,
} from './achievements'
import { syncSetupPrizeParticipants } from './prizes'
import { authorizeGhostPairing, createRound, type RandomSource } from './tables'
import type {
  AchievementConfig,
  IdFactory,
  LeaguePeriod,
  RotatingAchievementConfig,
  Round,
  Tournament,
  TournamentConfigInput,
} from './tournament'
import { validateTournamentConfig } from './validation'
import { createId } from '../utils/id'

function normalizedConfig(
  input: TournamentConfigInput,
  fallbackAchievementConfig: AchievementConfig = DEFAULT_ACHIEVEMENT_CONFIG,
  leaguePeriod?: LeaguePeriod,
) {
  const prizeMode = input.prizeMode ?? 'manual_credit'
  const inheritedAchievementConfig =
    prizeMode === 'league_auto' && leaguePeriod
      ? leaguePeriod.defaultAchievementConfig
      : fallbackAchievementConfig
  const rotatingAchievements: RotatingAchievementConfig[] = (
    input.rotatingAchievements ?? [
      { id: 'rotating1', label: input.rotating1, points: 1 },
      { id: 'rotating2', label: input.rotating2, points: 1 },
      { id: 'rotating3', label: input.rotating3, points: 1 },
    ]
  ).map((achievement) => ({ ...achievement, label: achievement.label.trim() }))
  const inheritedRotatingAchievements =
    prizeMode === 'league_auto' && leaguePeriod && !input.rotatingAchievements
      ? leaguePeriod.defaultRotatingAchievements
      : rotatingAchievements
  return {
    name: input.name.trim(),
    date: input.date,
    totalRounds: input.totalRounds,
    pairingMode: input.pairingMode ?? 'balanced_random',
    rotatingAchievements: inheritedRotatingAchievements.map((achievement) => ({
      ...achievement,
    })),
    type: prizeMode === 'league_auto' ? ('league_date' as const) : ('independent' as const),
    prizeMode,
    leaguePeriodId: prizeMode === 'league_auto' ? input.leaguePeriodId : undefined,
    achievementConfig: cloneAchievementConfig(
      input.achievementConfig ?? inheritedAchievementConfig,
    ),
    dateCreditConfig:
      prizeMode === 'manual_credit'
        ? {
            prizePool: input.prizePool,
            percentagesByPosition: [...input.percentagesByPosition],
          }
        : { prizePool: 0, percentagesByPosition: [] },
  }
}

export function createTournament(
  input: TournamentConfigInput,
  idFactory: IdFactory = createId,
  leaguePeriod?: LeaguePeriod,
): Tournament {
  const errors = validateTournamentConfig(input)
  if (errors.length > 0) throw new DomainError(errors.join(' '))

  const now = new Date().toISOString()
  return {
    id: idFactory('tournament'),
    ...normalizedConfig(input, DEFAULT_ACHIEVEMENT_CONFIG, leaguePeriod),
    currentRound: 0,
    status: 'setup',
    prizePlayerCount: 0,
    prizeParticipantIds: [],
    participants: [],
    rounds: [],
    ghostPairingAuthorized: false,
    financialReviewRequired: false,
    createdAt: now,
    updatedAt: now,
  }
}

export interface TournamentConfigurationUpdateOptions {
  recalculateResults?: boolean
  confirmPendingRoundRemoval?: boolean
  allowFinishedAdministration?: boolean
}

function roundContainsData(round: Round): boolean {
  return (
    round.status !== 'pending' ||
    round.tables.some(
      (table) =>
        table.status !== 'pending' ||
        table.savedResults.length > 0 ||
        table.editCount > 0 ||
        table.lastSavedAt !== undefined ||
        table.results.some(
          (result) =>
            result.rotating1 ||
            result.rotating2 ||
            result.rotating3 ||
            result.rotating4 ||
            result.rotating5 ||
            result.wonTable ||
            result.eliminations > 0 ||
            result.survived ||
            result.achievementPoints !== 0 ||
            result.specialLeaguePoints !== 0,
        ),
    )
  )
}

export interface RoundReductionAssessment {
  removableRoundNumbers: number[]
  blockingRoundNumber?: number
}

export function assessRoundReduction(
  tournament: Tournament,
  targetTotalRounds: number,
): RoundReductionAssessment {
  const roundsToRemove = tournament.rounds
    .filter((round) => round.number > targetTotalRounds)
    .sort((first, second) => first.number - second.number)
  const blockingRound = roundsToRemove.find(roundContainsData)
  return {
    removableRoundNumbers: roundsToRemove
      .filter((round) => !roundContainsData(round))
      .map((round) => round.number),
    blockingRoundNumber: blockingRound?.number,
  }
}

export function updateTournamentConfiguration(
  tournament: Tournament,
  input: TournamentConfigInput,
  options: TournamentConfigurationUpdateOptions = {},
): Tournament {
  if (tournament.status === 'finished' && !options.allowFinishedAdministration) {
    throw new DomainError('Usa la acción administrativa explícita para modificar un torneo finalizado.')
  }
  const errors = validateTournamentConfig(input)
  if (errors.length > 0) throw new DomainError(errors.join(' '))

  const nextConfig = normalizedConfig(input, tournament.achievementConfig)
  if (
    tournament.status !== 'setup' &&
    (nextConfig.type !== tournament.type || nextConfig.leaguePeriodId !== tournament.leaguePeriodId)
  ) {
    throw new DomainError('No puedes cambiar el tipo o la liga de un torneo que ya fue iniciado.')
  }

  const roundAssessment = assessRoundReduction(tournament, input.totalRounds)
  if (roundAssessment.blockingRoundNumber !== undefined) {
    throw new DomainError(
      `No puedes reducir el torneo a ${input.totalRounds} rondas porque la Ronda ${roundAssessment.blockingRoundNumber} ya contiene datos.`,
    )
  }
  if (
    roundAssessment.removableRoundNumbers.length > 0 &&
    !options.confirmPendingRoundRemoval
  ) {
    throw new DomainError(
      `Confirma la eliminación de la Ronda ${roundAssessment.removableRoundNumbers.join(', ')} pendiente y sin resultados.`,
    )
  }

  const achievementConfigChanged = !achievementConfigsEqual(
    tournament.achievementConfig,
    nextConfig.achievementConfig,
  )
  if (
    achievementConfigChanged &&
    tournamentHasRecordedResults(tournament) &&
    !options.recalculateResults
  ) {
    throw new DomainError(
      'Este cambio recalculará los puntajes de resultados ya registrados y puede modificar la clasificación.',
    )
  }

  const remainingRounds = tournament.rounds.filter((round) => round.number <= input.totalRounds)
  const nextCurrentRound = Math.min(tournament.currentRound, input.totalRounds)
  let updated: Tournament = {
    ...tournament,
    ...nextConfig,
    rounds: remainingRounds,
    currentRound: nextCurrentRound,
    updatedAt: new Date().toISOString(),
  }

  if (achievementConfigChanged && options.recalculateResults) {
    updated = recalculateTournamentAchievementPoints(updated, nextConfig.achievementConfig)
  }

  if (tournament.status === 'setup') return syncSetupPrizeParticipants(updated)

  return updated
}

export function startTournament(
  tournament: Tournament,
  random: RandomSource = Math.random,
  idFactory: IdFactory = createId,
  useGhost = false,
): Tournament {
  if (tournament.status !== 'setup') {
    throw new DomainError('Este torneo ya fue iniciado.')
  }

  const tournamentWithFrozenPrizeCount = syncSetupPrizeParticipants(tournament)
  const preparedTournament = useGhost
    ? authorizeGhostPairing(tournamentWithFrozenPrizeCount, idFactory)
    : tournamentWithFrozenPrizeCount
  const firstRound = createRound(preparedTournament, 1, random, idFactory, useGhost)
  return {
    ...preparedTournament,
    status: 'active',
    currentRound: 1,
    rounds: [firstRound],
    updatedAt: new Date().toISOString(),
  }
}

export function getCurrentRound(tournament: Tournament) {
  return tournament.rounds.find((round) => round.number === tournament.currentRound)
}
