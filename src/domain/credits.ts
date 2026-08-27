import { DomainError } from './errors'
import type { CreditMovement, IdFactory } from './tournament'
import { createId } from '../utils/id'

export interface CreditMovementContext {
  tournamentId?: string
  leaguePeriodId?: string
}

export function calculateAvailableCredit(
  movements: CreditMovement[],
  playerKey: string,
): number {
  if (playerKey.startsWith('ghost:')) return 0
  return movements
    .filter((movement) => movement.playerKey === playerKey && movement.status === 'active')
    .reduce((balance, movement) => {
      if (
        movement.type === 'date_prize' ||
        movement.type === 'month_prize' ||
        movement.type === 'positive_adjustment'
      ) {
        return balance + movement.amount
      }
      return balance - movement.amount
    }, 0)
}

export function registerCreditUsage(
  movements: CreditMovement[],
  playerKey: string,
  amount: number,
  reason: string,
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
  context: CreditMovementContext = {},
): CreditMovement[] {
  if (playerKey.startsWith('ghost:')) {
    throw new DomainError('El Jugador Fantasma no puede recibir ni utilizar crédito.')
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new DomainError('El monto utilizado debe ser mayor a 0.')
  }
  if (!reason.trim()) throw new DomainError('Indica el motivo del uso de crédito.')
  if (amount > calculateAvailableCredit(movements, playerKey)) {
    throw new DomainError('El monto supera el crédito disponible.')
  }
  return [
    ...movements,
    {
      id: idFactory('credit-movement'),
      playerKey,
      ...context,
      type: 'usage',
      amount,
      reason: reason.trim(),
      createdAt: now,
      status: 'active',
    },
  ]
}

export function registerCreditAdjustment(
  movements: CreditMovement[],
  playerKey: string,
  amount: number,
  direction: 'positive' | 'negative',
  reason: string,
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
  context: CreditMovementContext = {},
): CreditMovement[] {
  if (playerKey.startsWith('ghost:')) {
    throw new DomainError('El Jugador Fantasma no puede recibir movimientos de crédito.')
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new DomainError('El monto del ajuste debe ser mayor a 0.')
  }
  if (!reason.trim()) throw new DomainError('El motivo del ajuste es obligatorio.')
  return [
    ...movements,
    {
      id: idFactory('credit-movement'),
      playerKey,
      ...context,
      type: direction === 'positive' ? 'positive_adjustment' : 'negative_adjustment',
      amount,
      reason: reason.trim(),
      createdAt: now,
      status: 'active',
    },
  ]
}

export function voidCreditMovement(
  movements: CreditMovement[],
  movementId: string,
): CreditMovement[] {
  const movement = movements.find((item) => item.id === movementId)
  if (!movement) throw new DomainError('No se encontró el movimiento de crédito.')
  if (movement.status === 'void') return movements
  return movements.map((item) =>
    item.id === movementId ? { ...item, status: 'void' as const } : item,
  )
}
