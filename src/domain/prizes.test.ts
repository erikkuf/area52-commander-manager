import { describe, expect, it } from 'vitest'
import { calculateAvailableCredit } from './credits'
import { importParticipants, removeParticipant, setParticipantActive } from './participants'
import {
  calculateLeaguePoolSummary,
  calculatePrizeDistribution,
  calculateTournamentPrizeSummary,
  confirmLateRegistrationPrizePlayers,
  createDefaultLeaguePeriod,
  rebalanceLeagueContribution,
  upsertLeaguePoolContribution,
  validateLeaguePeriod,
} from './prizes'
import { createTournament, startTournament } from './tournamentOperations'
import { confirmRoundTables } from './tables'
import type { IdFactory, LeaguePrizeLedger, PrizeMode, Tournament } from './tournament'

function scopedIds(scope: string): IdFactory {
  let value = 0
  return (prefix) => `${scope}-${prefix}-${++value}`
}

const leaguePeriod = createDefaultLeaguePeriod(scopedIds('league'), '2026-08-14T12:00:00.000Z')

function names(count: number, offset = 0): string {
  return Array.from({ length: count }, (_, index) => `Jugador ${index + 1 + offset}`).join('\n')
}

function tournament(mode: PrizeMode, count = 0, scope = `${mode}-${count}`): Tournament {
  const base = createTournament(
    {
      name: `Torneo ${scope}`,
      date: '2026-08-14',
      totalRounds: 3,
      rotating1: 'R1',
      rotating2: 'R2',
      rotating3: 'R3',
      prizeMode: mode,
      leaguePeriodId: mode === 'league_auto' ? leaguePeriod.id : undefined,
      prizePool: mode === 'manual_credit' ? 40000 : 0,
      percentagesByPosition: [50, 30, 20],
    },
    scopedIds(scope),
  )
  return count > 0
    ? importParticipants(base, names(count), scopedIds(`${scope}-players`)).tournament
    : base
}

describe('premios automáticos de liga', () => {
  it.each([
    [16, 32000, 32000, 64000],
    [10, 20000, 20000, 40000],
  ])('calcula los pozos para %s jugadores', (playerCount, datePool, monthlyPool, total) => {
    const summary = calculateTournamentPrizeSummary(
      tournament('league_auto', playerCount),
      leaguePeriod,
    )

    expect(summary).toMatchObject({
      prizePlayerCount: playerCount,
      datePrizePool: datePool,
      monthlyPoolContribution: monthlyPool,
      totalGenerated: total,
    })
  })

  it('recalcula al agregar y eliminar jugadores durante setup', () => {
    const base = tournament('league_auto', 9)
    const added = importParticipants(base, 'Jugador 10', scopedIds('add')).tournament
    const removed = removeParticipant(added, added.participants[0].id)

    expect(added.prizePlayerCount).toBe(10)
    expect(calculateTournamentPrizeSummary(added, leaguePeriod).datePrizePool).toBe(20000)
    expect(removed.prizePlayerCount).toBe(9)
    expect(calculateTournamentPrizeSummary(removed, leaguePeriod).datePrizePool).toBe(18000)
  })

  it('congela el conteo al iniciar y un DROP posterior no reduce los pozos', () => {
    const pending = startTournament(
      tournament('league_auto', 10),
      () => 0.5,
      scopedIds('round'),
    )
    const started = confirmRoundTables(pending, pending.rounds[0].id)
    const dropped = setParticipantActive(started, started.participants[0].id, false)

    expect(dropped.prizePlayerCount).toBe(10)
    expect(calculateTournamentPrizeSummary(dropped, leaguePeriod)).toMatchObject({
      datePrizePool: 20000,
      monthlyPoolContribution: 20000,
    })
  })

  it('late registration aumenta el conteo únicamente después de confirmación', () => {
    const started = startTournament(
      tournament('league_auto', 10),
      () => 0.5,
      scopedIds('round-late'),
    )
    const imported = importParticipants(started, 'Jugador tardío', scopedIds('late'))

    expect(imported.tournament.participants).toHaveLength(11)
    expect(imported.tournament.prizePlayerCount).toBe(10)

    const confirmed = confirmLateRegistrationPrizePlayers(
      imported.tournament,
      imported.report.addedParticipantIds,
    )
    expect(confirmed.prizePlayerCount).toBe(11)
    expect(calculateTournamentPrizeSummary(confirmed, leaguePeriod).totalGenerated).toBe(44000)
  })

  it('suma varias fechas en el pozo mensual proyectado', () => {
    let ledger: LeaguePrizeLedger = { leaguePeriods: [leaguePeriod], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [] }
    ;[12, 16, 20].forEach((playerCount, index) => {
      const date = tournament('league_auto', playerCount, `date-${index}`)
      ledger = upsertLeaguePoolContribution(
        ledger,
        date,
        leaguePeriod,
        scopedIds(`contribution-${index}`),
        `2026-08-${10 + index}T12:00:00.000Z`,
      )
    })

    expect(ledger.contributions.map((item) => item.monthlyPoolContribution)).toEqual([
      24000, 32000, 40000,
    ])
    expect(calculateLeaguePoolSummary(ledger.contributions, leaguePeriod.id)).toEqual({
      monthlyFinalizedPool: 0,
      monthlyProjectedPool: 96000,
    })
  })

  it('finalizar, reabrir o recalcular no duplica el aporte del torneo', () => {
    const finished = { ...tournament('league_auto', 16, 'idempotent'), status: 'finished' as const }
    const initial: LeaguePrizeLedger = { leaguePeriods: [leaguePeriod], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [] }
    const once = upsertLeaguePoolContribution(initial, finished, leaguePeriod, scopedIds('once'), '2026-08-14T10:00:00.000Z')
    const twice = upsertLeaguePoolContribution(once, finished, leaguePeriod, scopedIds('twice'), '2026-08-14T11:00:00.000Z')
    const reopened = upsertLeaguePoolContribution(
      twice,
      { ...finished, status: 'active' },
      leaguePeriod,
      scopedIds('reopen'),
      '2026-08-14T12:00:00.000Z',
    )

    expect(twice.contributions).toHaveLength(1)
    expect(twice.contributions[0].id).toBe(once.contributions[0].id)
    expect(reopened.contributions).toHaveLength(1)
    expect(reopened.contributions[0].status).toBe('projected')
  })

  it('separa correctamente pozo confirmado y proyectado', () => {
    const contributions = [
      { id: '1', leaguePeriodId: leaguePeriod.id, tournamentId: '1', playerCount: 12, datePoolAmount: 24000, monthlyPoolContribution: 24000, status: 'finalized' as const, createdAt: 'now' },
      { id: '2', leaguePeriodId: leaguePeriod.id, tournamentId: '2', playerCount: 16, datePoolAmount: 32000, monthlyPoolContribution: 32000, status: 'finalized' as const, createdAt: 'now' },
      { id: '3', leaguePeriodId: leaguePeriod.id, tournamentId: '3', playerCount: 20, datePoolAmount: 40000, monthlyPoolContribution: 40000, status: 'projected' as const, createdAt: 'now' },
    ]
    expect(calculateLeaguePoolSummary(contributions, leaguePeriod.id)).toEqual({
      monthlyFinalizedPool: 56000,
      monthlyProjectedPool: 96000,
    })
  })
})

describe('premios independientes y distribuciones', () => {
  it('el pozo manual no depende de la cantidad de jugadores', () => {
    const withThree = tournament('manual_credit', 3)
    const withEight = importParticipants(withThree, names(5, 3), scopedIds('more')).tournament

    expect(calculateTournamentPrizeSummary(withThree).datePrizePool).toBe(40000)
    expect(calculateTournamentPrizeSummary(withEight).datePrizePool).toBe(40000)
  })

  it('un torneo sin crédito siempre tiene pozo cero', () => {
    expect(calculateTournamentPrizeSummary(tournament('none', 16))).toMatchObject({
      datePrizePool: 0,
      monthlyPoolContribution: 0,
      totalGenerated: 0,
    })
  })

  it('aplica porcentajes correctos al pozo de fecha', () => {
    expect(calculatePrizeDistribution(32000, [50, 30, 20])).toEqual([16000, 9600, 6400])
  })

  it('distribuye el pozo en una cantidad variable de posiciones', () => {
    expect(calculatePrizeDistribution(100000, [35, 25, 20, 12, 8])).toEqual([
      35000, 25000, 20000, 12000, 8000,
    ])
  })

  it('aplica porcentajes al pozo mensual proyectado sin aumentar crédito disponible', () => {
    const monthlyProjectedPool = 96000
    expect(calculatePrizeDistribution(monthlyProjectedPool, [50, 30, 20])).toEqual([
      48000, 28800, 19200,
    ])
    expect(calculateAvailableCredit([], 'player-1')).toBe(0)
  })

  it('valida que los aportes de fecha y mes sumen el total', () => {
    expect(
      validateLeaguePeriod({
        ...leaguePeriod,
        contributionConfig: {
          contributionPerPlayer: 4000,
          dateContributionPerPlayer: 2500,
          monthlyContributionPerPlayer: 2000,
        },
      }),
    ).toContain('El aporte de fecha más el aporte mensual debe ser igual al aporte total.')
  })

  it('compensa el aporte mensual al modificar el aporte de fecha', () => {
    expect(
      rebalanceLeagueContribution(
        {
          contributionPerPlayer: 4000,
          dateContributionPerPlayer: 2000,
          monthlyContributionPerPlayer: 2000,
        },
        'dateContributionPerPlayer',
        2001,
      ),
    ).toEqual({
      contributionPerPlayer: 4000,
      dateContributionPerPlayer: 2001,
      monthlyContributionPerPlayer: 1999,
    })
  })

  it('compensa el aporte de fecha al modificar el aporte mensual', () => {
    expect(
      rebalanceLeagueContribution(
        {
          contributionPerPlayer: 4000,
          dateContributionPerPlayer: 2000,
          monthlyContributionPerPlayer: 2000,
        },
        'monthlyContributionPerPlayer',
        1500,
      ),
    ).toEqual({
      contributionPerPlayer: 4000,
      dateContributionPerPlayer: 2500,
      monthlyContributionPerPlayer: 1500,
    })
  })

  it('recalcula el mensual al modificar el aporte total', () => {
    expect(
      rebalanceLeagueContribution(
        {
          contributionPerPlayer: 4000,
          dateContributionPerPlayer: 2000,
          monthlyContributionPerPlayer: 2000,
        },
        'contributionPerPlayer',
        3000,
      ),
    ).toEqual({
      contributionPerPlayer: 3000,
      dateContributionPerPlayer: 2000,
      monthlyContributionPerPlayer: 1000,
    })
  })
})
