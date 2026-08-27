import { DomainError } from './errors'
import {
  authorizeGhostPairing,
  createRound,
  requiresGhostPairing,
  type RandomSource,
} from './tables'
import type { IdFactory, Tournament } from './tournament'
import { createId } from '../utils/id'

export function isRoundComplete(tournament: Tournament, roundId: string): boolean {
  const round = tournament.rounds.find((item) => item.id === roundId)
  return Boolean(
    round &&
      round.status === 'active' &&
      round.tables.length > 0 &&
      round.tables.every((table) => table.status === 'saved'),
  )
}

export function countSavedTables(tournament: Tournament, roundId: string): number {
  const round = tournament.rounds.find((item) => item.id === roundId)
  return round?.tables.filter((table) => table.status === 'saved').length ?? 0
}

export function finishRound(tournament: Tournament, roundId: string): Tournament {
  const round = tournament.rounds.find((item) => item.id === roundId)
  if (!round) throw new DomainError('No se encontró la ronda.')
  if (round.status === 'finished') return tournament
  if (round.status !== 'active') {
    throw new DomainError('La ronda debe estar activa antes de finalizarla.')
  }
  if (!isRoundComplete(tournament, roundId)) {
    throw new DomainError('Todas las mesas deben estar guardadas antes de finalizar la ronda.')
  }

  return {
    ...tournament,
    status: round.number === tournament.totalRounds ? 'rounds_completed' : tournament.status,
    rounds: tournament.rounds.map((item) =>
      item.id === roundId ? { ...item, status: 'finished' as const } : item,
    ),
    updatedAt: new Date().toISOString(),
  }
}

export function generateNextRound(
  tournament: Tournament,
  random: RandomSource = Math.random,
  idFactory: IdFactory = createId,
  useGhost = tournament.ghostPairingAuthorized && requiresGhostPairing(tournament),
): Tournament {
  const currentRound = tournament.rounds.find(
    (round) => round.number === tournament.currentRound,
  )
  if (!currentRound) throw new DomainError('No se encontró la ronda actual.')
  if (currentRound.status !== 'finished') {
    throw new DomainError('Finaliza la ronda actual antes de generar la siguiente.')
  }
  if (tournament.currentRound >= tournament.totalRounds) {
    throw new DomainError('Ya se jugaron todas las rondas configuradas.')
  }

  const nextRoundNumber = tournament.currentRound + 1
  if (tournament.rounds.some((round) => round.number === nextRoundNumber)) {
    throw new DomainError('La siguiente ronda ya fue generada.')
  }

  const preparedTournament = useGhost
    ? authorizeGhostPairing(tournament, idFactory)
    : tournament
  const nextRound = createRound(preparedTournament, nextRoundNumber, random, idFactory, useGhost)
  return {
    ...preparedTournament,
    status: 'active',
    currentRound: nextRoundNumber,
    rounds: [...tournament.rounds, nextRound],
    updatedAt: new Date().toISOString(),
  }
}

export function finalizeTournament(
  tournament: Tournament,
  now = new Date().toISOString(),
): Tournament {
  if (tournament.status === 'finished') return tournament
  if (tournament.status !== 'rounds_completed') {
    throw new DomainError('Completa todas las rondas antes de finalizar el evento.')
  }
  return {
    ...tournament,
    status: 'finished',
    finishedAt: now,
    updatedAt: now,
  }
}
