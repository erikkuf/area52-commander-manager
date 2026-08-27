import { DomainError } from './errors'
import { calculateLeaderboard } from './leaderboard'
import type {
  IdFactory,
  LeaguePrizeLedger,
  SpecialPointMovement,
  Tournament,
} from './tournament'
import { createId } from '../utils/id'

export function calculateSpecialLeaguePoints(
  movements: SpecialPointMovement[],
  leaguePeriodId: string,
  playerKey: string,
): number {
  return movements
    .filter(
      (movement) =>
        movement.leaguePeriodId === leaguePeriodId &&
        movement.playerKey === playerKey &&
        movement.status === 'active',
    )
    .reduce((total, movement) => total + movement.amount, 0)
}

export function registerSpecialPointMovement(
  movements: SpecialPointMovement[],
  leaguePeriodId: string,
  playerKey: string,
  amount: number,
  reason = '',
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): SpecialPointMovement[] {
  if (!leaguePeriodId || !playerKey) {
    throw new DomainError('La liga y el jugador son obligatorios.')
  }
  if (playerKey.startsWith('ghost:')) {
    throw new DomainError('El Jugador Fantasma no puede recibir puntos especiales.')
  }
  if (!Number.isInteger(amount) || amount === 0) {
    throw new DomainError('Los puntos especiales deben ser un entero distinto de 0.')
  }
  return [
    ...movements,
    {
      id: idFactory('special-point'),
      leaguePeriodId,
      playerKey,
      amount,
      reason: reason.trim() || undefined,
      createdAt: now,
      status: 'active',
    },
  ]
}

export function voidSpecialPointMovement(
  movements: SpecialPointMovement[],
  movementId: string,
  now = new Date().toISOString(),
): SpecialPointMovement[] {
  const movement = movements.find((item) => item.id === movementId)
  if (!movement) throw new DomainError('No se encontró el movimiento de puntos especiales.')
  if (movement.status === 'void') return movements
  return movements.map((item) =>
    item.id === movementId ? { ...item, status: 'void' as const, voidedAt: now } : item,
  )
}

export function migrateLegacySpecialPointMovements(
  tournaments: Tournament[],
  ledger: LeaguePrizeLedger,
): LeaguePrizeLedger {
  const additions: SpecialPointMovement[] = []
  ledger.leaguePeriods.forEach((leaguePeriod) => {
    const totals = new Map<string, { amount: number; name: string }>()
    tournaments
      .filter(
        (tournament) =>
          tournament.type === 'league_date' &&
          tournament.leaguePeriodId === leaguePeriod.id,
      )
      .forEach((tournament) => {
        const participants = new Map(
          tournament.participants.map((participant) => [participant.id, participant]),
        )
        calculateLeaderboard(tournament).forEach((entry) => {
          if (entry.specialLeaguePoints === 0) return
          const participant = participants.get(entry.participantId)
          if (!participant) return
          const current = totals.get(participant.playerKey) ?? {
            amount: 0,
            name: participant.name,
          }
          current.amount += entry.specialLeaguePoints
          totals.set(participant.playerKey, current)
        })
      })

    totals.forEach((value, playerKey) => {
      const id = `legacy-special:${leaguePeriod.id}:${playerKey}`
      if (
        value.amount === 0 ||
        ledger.specialPointMovements.some((movement) => movement.id === id)
      ) return
      additions.push({
        id,
        leaguePeriodId: leaguePeriod.id,
        playerKey,
        amount: value.amount,
        reason: `Migración de puntos especiales históricos · ${value.name}`,
        createdAt: leaguePeriod.updatedAt,
        status: 'active',
      })
    })
  })

  return additions.length === 0
    ? ledger
    : { ...ledger, specialPointMovements: [...ledger.specialPointMovements, ...additions] }
}
