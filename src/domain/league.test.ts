import { describe, expect, it } from 'vitest'
import { calculateAvailableCredit, registerCreditUsage } from './credits'
import { finishLeaguePeriod } from './league'
import { importParticipants } from './participants'
import { createDefaultLeaguePeriod, upsertLeaguePoolContribution } from './prizes'
import { saveTableResults, updatePlayerResult } from './results'
import { finalizeTournament, finishRound } from './rounds'
import { confirmRoundTables } from './tables'
import { createTournament, startTournament } from './tournamentOperations'
import type { IdFactory, LeaguePrizeLedger, Tournament } from './tournament'

function ids(scope: string): IdFactory {
  let value = 0
  return (prefix) => `${scope}-${prefix}-${++value}`
}

function finishedLeagueDate(leaguePeriodId: string): Tournament {
  const setup = importParticipants(
    createTournament({
      name: 'Fecha final',
      date: '2026-08-30',
      totalRounds: 1,
      rotating1: 'R1',
      rotating2: 'R2',
      rotating3: 'R3',
      type: 'league_date',
      prizeMode: 'league_auto',
      leaguePeriodId,
      prizePool: 0,
      percentagesByPosition: [50, 30, 20],
    }, ids('tournament')),
    'Ana\nBeto\nCarla',
    ids('players'),
  ).tournament
  const started = startTournament(setup, () => 0.5, ids('round'))
  let active = confirmRoundTables(started, started.rounds[0].id)
  const table = active.rounds[0].tables[0]
  active = updatePlayerResult(active, active.rounds[0].id, table.id, active.participants[0].id, {
    rotating1: true,
    wonTable: true,
  })
  active = saveTableResults(active, active.rounds[0].id, table.id)
  return finalizeTournament(finishRound(active, active.rounds[0].id))
}

describe('cierre competitivo de liga', () => {
  it('finaliza la liga y no duplica premios al ejecutar dos veces', () => {
    const league = { ...createDefaultLeaguePeriod(ids('league')), id: 'league-1' }
    const tournament = finishedLeagueDate(league.id)
    const initial: LeaguePrizeLedger = upsertLeaguePoolContribution(
      { leaguePeriods: [league], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [] },
      tournament,
      league,
      ids('contribution'),
    )
    const once = finishLeaguePeriod(initial, league.id, [tournament], ids('finish'), '2026-08-31T20:00:00.000Z')
    const twice = finishLeaguePeriod(once, league.id, [tournament], ids('finish-again'), '2026-08-31T21:00:00.000Z')

    expect(once.leaguePeriods[0]).toMatchObject({ status: 'finished', finishedAt: '2026-08-31T20:00:00.000Z' })
    expect(once.creditMovements.filter((movement) => movement.type === 'date_prize')).toHaveLength(3)
    expect(once.creditMovements.filter((movement) => movement.type === 'month_prize')).toHaveLength(3)
    expect(twice).toEqual(once)
  })

  it('permite registrar uso de crédito después de finalizar la competencia', () => {
    const league = { ...createDefaultLeaguePeriod(ids('league')), id: 'league-credit' }
    const tournament = finishedLeagueDate(league.id)
    const ledger = finishLeaguePeriod(
      upsertLeaguePoolContribution(
        { leaguePeriods: [league], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [] },
        tournament,
        league,
        ids('contribution'),
      ),
      league.id,
      [tournament],
      ids('finish'),
    )
    const winner = tournament.participants[0]
    const available = calculateAvailableCredit(ledger.creditMovements, winner.playerKey)
    const movements = registerCreditUsage(
      ledger.creditMovements,
      winner.playerKey,
      1000,
      'Compra en tienda',
      ids('usage'),
    )

    expect(ledger.leaguePeriods[0].status).toBe('finished')
    expect(movements.at(-1)).toMatchObject({ type: 'usage', amount: 1000 })
    expect(calculateAvailableCredit(movements, winner.playerKey)).toBe(available - 1000)
  })
})
