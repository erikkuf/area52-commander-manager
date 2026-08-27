import { describe, expect, it } from 'vitest'
import {
  calculateAvailableCredit,
  registerCreditAdjustment,
  registerCreditUsage,
  voidCreditMovement,
} from './credits'
import type { CreditMovement } from './tournament'

const earned: CreditMovement[] = [{
  id: 'month-prize-1',
  playerKey: 'player-1',
  leaguePeriodId: 'finished-league',
  type: 'month_prize',
  amount: 10000,
  reason: 'Premio final',
  createdAt: '2026-08-31T20:00:00.000Z',
  status: 'active',
}]

describe('movimientos de crédito independientes del estado competitivo', () => {
  it('registra uso y conserva trazabilidad al anularlo', () => {
    const used = registerCreditUsage(earned, 'player-1', 3000, 'Compra', () => 'usage-1')
    expect(calculateAvailableCredit(used, 'player-1')).toBe(7000)

    const voided = voidCreditMovement(used, 'usage-1')
    expect(voided.find((movement) => movement.id === 'usage-1')?.status).toBe('void')
    expect(calculateAvailableCredit(voided, 'player-1')).toBe(10000)
  })

  it('registra ajustes administrativos con motivo obligatorio', () => {
    const positive = registerCreditAdjustment(
      earned,
      'player-1',
      2000,
      'positive',
      'Compensación',
      () => 'adjustment-1',
    )
    const negative = registerCreditAdjustment(
      positive,
      'player-1',
      1000,
      'negative',
      'Corrección',
      () => 'adjustment-2',
    )
    expect(calculateAvailableCredit(negative, 'player-1')).toBe(11000)
    expect(() => registerCreditAdjustment(earned, 'player-1', 1000, 'positive', '')).toThrow(/motivo/)
  })

  it('puede vincular usos históricos a la liga que los originó', () => {
    const used = registerCreditUsage(
      earned,
      'player-1',
      3000,
      'Uso histórico',
      () => 'usage-linked',
      '2026-08-19T12:00:00.000Z',
      { leaguePeriodId: 'finished-league' },
    )
    expect(used.at(-1)).toMatchObject({
      id: 'usage-linked',
      leaguePeriodId: 'finished-league',
      type: 'usage',
    })
  })
})
