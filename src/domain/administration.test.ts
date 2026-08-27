import { describe, expect, it } from 'vitest'
import { cloneAchievementConfig } from './achievements'
import { calculateLeaderboard } from './leaderboard'
import { buildLeagueLeaderboard, markLeagueReviewRequired } from './league'
import { importParticipants } from './participants'
import {
  addLeaguePeriod,
  createDefaultLeaguePeriod,
  updateLeaguePeriod,
} from './prizes'
import { saveTableResults, updatePlayerResult } from './results'
import {
  calculateSpecialLeaguePoints,
  registerSpecialPointMovement,
  voidSpecialPointMovement,
} from './specialPoints'
import { confirmRoundTables, createRound } from './tables'
import type {
  IdFactory,
  LeaguePrizeLedger,
  Tournament,
  TournamentConfigInput,
} from './tournament'
import {
  createTournament,
  startTournament,
  updateTournamentConfiguration,
} from './tournamentOperations'

function ids(scope: string): IdFactory {
  let value = 0
  return (prefix) => `${scope}-${prefix}-${++value}`
}

function input(
  overrides: Partial<TournamentConfigInput> = {},
): TournamentConfigInput {
  return {
    name: 'Evento configurable',
    date: '2026-08-14',
    totalRounds: 3,
    rotating1: 'R1',
    rotating2: 'R2',
    rotating3: 'R3',
    prizeMode: 'none',
    type: 'independent',
    prizePool: 0,
    percentagesByPosition: [50, 30, 20],
    ...overrides,
  }
}

function configFromTournament(
  tournament: Tournament,
  overrides: Partial<TournamentConfigInput> = {},
): TournamentConfigInput {
  return input({
    name: tournament.name,
    date: tournament.date,
    totalRounds: tournament.totalRounds,
    rotating1: tournament.rotatingAchievements[0].label,
    rotating2: tournament.rotatingAchievements[1].label,
    rotating3: tournament.rotatingAchievements[2].label,
    type: tournament.type,
    prizeMode: tournament.prizeMode,
    leaguePeriodId: tournament.leaguePeriodId,
    prizePool: tournament.dateCreditConfig.prizePool,
    percentagesByPosition:
      tournament.dateCreditConfig.percentagesByPosition.length > 0
        ? tournament.dateCreditConfig.percentagesByPosition
        : [50, 30, 20],
    achievementConfig: cloneAchievementConfig(tournament.achievementConfig),
    ...overrides,
  })
}

describe('herencia de logros y administración de ligas', () => {
  it('Tournament hereda un snapshot de LeaguePeriod y no cambia al modificar el default', () => {
    const league = createDefaultLeaguePeriod(ids('league'))
    const first = createTournament(input({
      type: 'league_date',
      prizeMode: 'league_auto',
      leaguePeriodId: league.id,
    }), ids('first'), league)
    const changedLeague = {
      ...league,
      defaultAchievementConfig: cloneAchievementConfig(league.defaultAchievementConfig),
    }
    changedLeague.defaultAchievementConfig.win.points = 5
    const second = createTournament(input({
      type: 'league_date',
      prizeMode: 'league_auto',
      leaguePeriodId: league.id,
    }), ids('second'), changedLeague)

    expect(first.achievementConfig.win.points).toBe(3)
    expect(second.achievementConfig.win.points).toBe(5)
    expect(first.achievementConfig).not.toBe(league.defaultAchievementConfig)
  })

  it('crea una liga y permite modificar una activa sin alterar fechas existentes', () => {
    const league = createDefaultLeaguePeriod(ids('league-create'))
    const initial: LeaguePrizeLedger = {
      leaguePeriods: [],
      contributions: [],
      creditMovements: [],
      specialPointMovements: [],
      championSnapshots: [],
    }
    const created = addLeaguePeriod(initial, league)
    const date = createTournament(input({
      type: 'league_date', prizeMode: 'league_auto', leaguePeriodId: league.id,
    }), ids('date'), league)
    const updatedConfig = cloneAchievementConfig(league.defaultAchievementConfig)
    updatedConfig.win.points = 4
    const updated = updateLeaguePeriod(created, {
      ...league,
      name: 'Liga modificada',
      defaultAchievementConfig: updatedConfig,
    })

    expect(updated.leaguePeriods[0].name).toBe('Liga modificada')
    expect(date.achievementConfig.win.points).toBe(3)
  })

  it('el mismo flujo crea league_date e independent y exige liga solo al primero', () => {
    const league = createDefaultLeaguePeriod(ids('flow-league'))
    const leagueDate = createTournament(input({
      type: 'league_date', prizeMode: 'league_auto', leaguePeriodId: league.id,
    }), ids('flow-date'), league)
    const independent = createTournament(input({
      type: 'independent', prizeMode: 'none', leaguePeriodId: undefined,
    }), ids('flow-independent'))

    expect(leagueDate.type).toBe('league_date')
    expect(independent.type).toBe('independent')
    expect(independent.leaguePeriodId).toBeUndefined()
    expect(() => createTournament(input({
      type: 'league_date', prizeMode: 'league_auto', leaguePeriodId: undefined,
    }))).toThrow(/período/)
  })

  it('modificar una liga finalizada exige confirmación y marca revisión sin recalcular snapshots', () => {
    const league = {
      ...createDefaultLeaguePeriod(ids('finished-league')),
      status: 'finished' as const,
      finalizedMonthlyPool: 50000,
    }
    const ledger: LeaguePrizeLedger = {
      leaguePeriods: [league], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [],
    }
    const defaultAchievementConfig = cloneAchievementConfig(league.defaultAchievementConfig)
    defaultAchievementConfig.win.points = 6
    const draft = { ...league, defaultAchievementConfig }

    expect(() => updateLeaguePeriod(ledger, draft)).toThrow(/liga finalizada/)
    const updated = updateLeaguePeriod(ledger, draft, { confirmFinishedSensitiveChange: true })
    expect(updated.leaguePeriods[0]).toMatchObject({
      reviewRequired: true,
      finalizedMonthlyPool: 50000,
    })
    expect(updated.contributions).toEqual([])
  })
})

describe('recálculo explícito de logros', () => {
  it('cambia win 3 a 5 preservando wonTable y recalculando leaderboard', () => {
    const setup = importParticipants(
      createTournament(input({ totalRounds: 1 }), ids('recalc-base')),
      'Ana\nBeto\nCarla',
      ids('recalc-player'),
    ).tournament
    const pending = startTournament(setup, () => 0.5, ids('recalc-round'))
    let active = confirmRoundTables(pending, pending.rounds[0].id)
    const table = active.rounds[0].tables[0]
    active = updatePlayerResult(active, active.rounds[0].id, table.id, table.participantIds[0], { wonTable: true })
    active = saveTableResults(active, active.rounds[0].id, table.id)
    const changedConfig = cloneAchievementConfig(active.achievementConfig)
    changedConfig.win.points = 5
    const nextInput = configFromTournament(active, { achievementConfig: changedConfig })

    expect(() => updateTournamentConfiguration(active, nextInput)).toThrow(/recalculará/)
    const recalculated = updateTournamentConfiguration(active, nextInput, { recalculateResults: true })
    expect(recalculated.rounds[0].tables[0].results[0].wonTable).toBe(true)
    expect(calculateLeaderboard(recalculated)[0].achievementPoints).toBe(5)
  })
})

describe('edición segura de cantidad de rondas', () => {
  it('permite aumentar 3 a 4 y reducir 4 a 3 cuando R4 no existe', () => {
    const tournament = createTournament(input(), ids('round-count'))
    const increased = updateTournamentConfiguration(
      tournament,
      configFromTournament(tournament, { totalRounds: 4 }),
    )
    const reduced = updateTournamentConfiguration(
      increased,
      configFromTournament(increased, { totalRounds: 3 }),
    )
    expect(increased.totalRounds).toBe(4)
    expect(reduced.totalRounds).toBe(3)
  })

  it('requiere confirmación para quitar una ronda pendiente vacía', () => {
    const withPlayers = importParticipants(
      createTournament(input({ totalRounds: 4 }), ids('pending-base')),
      'Ana\nBeto\nCarla',
      ids('pending-player'),
    ).tournament
    const pendingRound = createRound(withPlayers, 4, () => 0.5, ids('pending-round'))
    const tournament = {
      ...withPlayers,
      status: 'active' as const,
      currentRound: 4,
      rounds: [pendingRound],
    }
    const nextInput = configFromTournament(tournament, { totalRounds: 3 })

    expect(() => updateTournamentConfiguration(tournament, nextInput)).toThrow(/Confirma/)
    const reduced = updateTournamentConfiguration(tournament, nextInput, {
      confirmPendingRoundRemoval: true,
    })
    expect(reduced.rounds).toHaveLength(0)
    expect(reduced.totalRounds).toBe(3)
  })

  it('bloquea reducir si R4 contiene resultados y nunca altera el original', () => {
    const withPlayers = importParticipants(
      createTournament(input({ totalRounds: 4 }), ids('blocked-base')),
      'Ana\nBeto\nCarla',
      ids('blocked-player'),
    ).tournament
    const round = createRound(withPlayers, 4, () => 0.5, ids('blocked-round'))
    round.status = 'active'
    round.tables[0].results[0].wonTable = true
    const tournament = {
      ...withPlayers,
      status: 'active' as const,
      currentRound: 4,
      rounds: [round],
    }

    expect(() => updateTournamentConfiguration(
      tournament,
      configFromTournament(tournament, { totalRounds: 3 }),
      { confirmPendingRoundRemoval: true },
    )).toThrow('No puedes reducir el torneo a 3 rondas porque la Ronda 4 ya contiene datos.')
    expect(tournament.rounds[0].tables[0].results[0].wonTable).toBe(true)
  })
})

function finishedLeagueDate(leagueId: string, league = createDefaultLeaguePeriod(ids('fallback'))): Tournament {
  const setup = importParticipants(
    createTournament(input({
      type: 'league_date', prizeMode: 'league_auto', leaguePeriodId: leagueId, totalRounds: 1,
    }), ids('special-date'), { ...league, id: leagueId }),
    'Ana\nBeto\nCarla',
    ids('special-player'),
  ).tournament
  const pending = startTournament(setup, () => 0.5, ids('special-round'))
  let active = confirmRoundTables(pending, pending.rounds[0].id)
  const table = active.rounds[0].tables[0]
  const ana = active.participants.find((participant) => participant.name === 'Ana')!
  active = updatePlayerResult(active, active.rounds[0].id, table.id, ana.id, { rotating1: true })
  active = saveTableResults(active, active.rounds[0].id, table.id)
  return { ...active, status: 'finished', rounds: active.rounds.map((round) => ({ ...round, status: 'finished' })) }
}

describe('movimientos de puntos especiales', () => {
  it('acumula positivos y negativos, no afecta el leaderboard de fecha y void no cuenta', () => {
    const league = createDefaultLeaguePeriod(ids('special-league'))
    const tournament = finishedLeagueDate(league.id, league)
    const ana = tournament.participants.find((participant) => participant.name === 'Ana')!
    let movements = registerSpecialPointMovement([], league.id, ana.playerKey, 2, 'Evento', ids('movement'))
    movements = registerSpecialPointMovement(movements, league.id, ana.playerKey, 1, 'Comunidad', ids('movement2'))
    movements = registerSpecialPointMovement(movements, league.id, ana.playerKey, -1, 'Corrección', ids('movement3'))
    const ledger: LeaguePrizeLedger = {
      leaguePeriods: [league], contributions: [], creditMovements: [], specialPointMovements: movements, championSnapshots: [],
    }

    expect(calculateSpecialLeaguePoints(movements, league.id, ana.playerKey)).toBe(2)
    expect(calculateLeaderboard(tournament)[0].achievementPoints).toBe(1)
    expect(buildLeagueLeaderboard([tournament], league, ledger)[0]).toMatchObject({
      playerName: 'Ana', achievementPoints: 1, specialLeaguePoints: 2, leaguePoints: 3,
    })

    const voided = voidSpecialPointMovement(movements, movements[0].id)
    expect(calculateSpecialLeaguePoints(voided, league.id, ana.playerKey)).toBe(0)
  })

  it('una corrección de liga finalizada activa reviewRequired', () => {
    const league = { ...createDefaultLeaguePeriod(ids('review')), status: 'finished' as const }
    const ledger: LeaguePrizeLedger = {
      leaguePeriods: [league], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [],
    }
    expect(markLeagueReviewRequired(ledger, league.id).leaguePeriods[0].reviewRequired).toBe(true)
  })
})
