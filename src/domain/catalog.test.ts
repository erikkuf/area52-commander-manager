import { describe, expect, it } from 'vitest'
import { importParticipants } from './participants'
import { createDefaultLeaguePeriod, upsertLeaguePoolContribution } from './prizes'
import { saveTableResults, updatePlayerResult } from './results'
import { finalizeTournament, finishRound } from './rounds'
import { confirmRoundTables } from './tables'
import { createTournament, startTournament } from './tournamentOperations'
import {
  deriveTournamentWinner,
  getIndependentEvents,
  getLeagueDates,
  getLeaguePeriodsByStatus,
} from './catalog'
import { buildLeagueLeaderboard } from './league'
import type { IdFactory, LeaguePeriod, LeaguePrizeLedger, Tournament } from './tournament'

function ids(scope: string): IdFactory {
  let value = 0
  return (prefix) => `${scope}-${prefix}-${++value}`
}

function makeTournament(
  type: 'league_date' | 'independent',
  scope: string,
  leaguePeriodId?: string,
): Tournament {
  return importParticipants(
    createTournament(
      {
        name: scope,
        date: scope.includes('2') ? '2026-08-20' : '2026-08-10',
        totalRounds: 1,
        rotating1: 'R1',
        rotating2: 'R2',
        rotating3: 'R3',
        type,
        prizeMode: type === 'league_date' ? 'league_auto' : 'none',
        leaguePeriodId,
        prizePool: 0,
        percentagesByPosition: [50, 30, 20],
      },
      ids(`${scope}-tournament`),
    ),
    'Ana\nBeto\nCarla',
    ids(`${scope}-players`),
  ).tournament
}

function finishWithWinner(tournament: Tournament, playerName = 'Ana'): Tournament {
  const started = startTournament(tournament, () => 0.5, ids(`${tournament.name}-round`))
  const active = confirmRoundTables(started, started.rounds[0].id)
  const table = active.rounds[0].tables[0]
  const participant = active.participants.find((item) => item.name === playerName)!
  let current = updatePlayerResult(active, active.rounds[0].id, table.id, participant.id, {
    rotating1: true,
    wonTable: true,
  })
  current = saveTableResults(current, current.rounds[0].id, table.id)
  return finalizeTournament(finishRound(current, current.rounds[0].id))
}

describe('catálogo global', () => {
  const league = { ...createDefaultLeaguePeriod(ids('league')), id: 'league-1' }
  const otherLeague = { ...createDefaultLeaguePeriod(ids('other-league')), id: 'league-2' }
  const leagueDate = makeTournament('league_date', 'Fecha 1', league.id)
  const otherDate = makeTournament('league_date', 'Fecha 2', otherLeague.id)
  const independent = makeTournament('independent', 'Open independiente')

  it('muestra cada fecha solamente dentro de su liga', () => {
    expect(getLeagueDates([leagueDate, otherDate, independent], league.id).map((item) => item.id)).toEqual([leagueDate.id])
  })

  it('excluye fechas de liga de Eventos e incluye independientes', () => {
    const events = getIndependentEvents([leagueDate, otherDate, independent])
    expect(events.map((item) => item.id)).toEqual([independent.id])
  })

  it('separa ligas activas y finalizadas', () => {
    const finished: LeaguePeriod = { ...otherLeague, status: 'finished', finishedAt: '2026-08-31T23:00:00.000Z' }
    expect(getLeaguePeriodsByStatus([league, finished], 'active')).toEqual([league])
    expect(getLeaguePeriodsByStatus([league, finished], 'finished')).toEqual([finished])
  })

  it('deriva al ganador desde resultados guardados', () => {
    expect(deriveTournamentWinner(finishWithWinner(leagueDate))).toMatchObject({
      playerName: 'Ana',
      totalPoints: 4,
      achievementPoints: 4,
    })
  })

  it('agrega el standing únicamente con fechas de esa liga', () => {
    const first = finishWithWinner(leagueDate, 'Ana')
    const second = finishWithWinner(otherDate, 'Beto')
    let ledger: LeaguePrizeLedger = {
      leaguePeriods: [league, otherLeague],
      contributions: [],
      creditMovements: [],
      specialPointMovements: [],
      championSnapshots: [],
    }
    ledger = upsertLeaguePoolContribution(ledger, first, league, ids('contribution-1'))
    ledger = upsertLeaguePoolContribution(ledger, second, otherLeague, ids('contribution-2'))
    const standings = buildLeagueLeaderboard([first, second, independent], league, ledger)

    expect(standings[0]).toMatchObject({ playerName: 'Ana', leaguePoints: 4, participations: 1 })
    expect(standings.find((entry) => entry.playerName === 'Beto')?.leaguePoints).toBe(0)
  })
})
