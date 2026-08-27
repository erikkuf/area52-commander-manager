import { describe, expect, it } from 'vitest'
import { calculateTournamentStanding } from './leaderboard'
import { buildLeagueLeaderboard } from './league'
import { importParticipants, setParticipantActive } from './participants'
import {
  calculateTournamentPrizeSummary,
  createDefaultLeaguePeriod,
} from './prizes'
import { registerCreditAdjustment, calculateAvailableCredit } from './credits'
import { registerSpecialPointMovement } from './specialPoints'
import { saveTableResults, updatePlayerResult, validateTableResults } from './results'
import {
  authorizeGhostPairing,
  confirmRoundTables,
  createRound,
  requiresGhostPairing,
  swapRoundPlayers,
  validateRoundAssignments,
} from './tables'
import { createTournament, startTournament } from './tournamentOperations'
import { deserializeTournament, serializeTournament } from '../services/localStorageTournamentRepository'
import type { IdFactory, LeaguePrizeLedger, Tournament } from './tournament'

function ids(scope: string): IdFactory {
  let value = 0
  return (prefix) => `${scope}-${prefix}-${++value}`
}

function setupWithPlayers(count: number, leaguePeriodId?: string): Tournament {
  const league = leaguePeriodId ? createDefaultLeaguePeriod(ids('default-league')) : undefined
  return importParticipants(
    createTournament(
      {
        name: `Evento ${count}`,
        date: '2026-08-18',
        totalRounds: 3,
        rotating1: 'R1',
        rotating2: 'R2',
        rotating3: 'R3',
        type: leaguePeriodId ? 'league_date' : 'independent',
        prizeMode: leaguePeriodId ? 'league_auto' : 'none',
        leaguePeriodId,
        prizePool: 0,
        percentagesByPosition: [50, 30, 20],
      },
      ids(`tournament-${count}`),
      league,
    ),
    Array.from({ length: count }, (_, index) => `Jugador ${index + 1}`).join('\n'),
    ids(`players-${count}`),
  ).tournament
}

function authorizedFive(): Tournament {
  return authorizeGhostPairing(setupWithPlayers(5), ids('ghost'))
}

describe('Jugador Fantasma', () => {
  it('detecta que 5 jugadores reales requieren una solución especial', () => {
    const tournament = setupWithPlayers(5)
    expect(requiresGhostPairing(tournament)).toBe(true)
    expect(() => createRound(tournament, 1, () => 0.5, ids('round'))).toThrow(/Autoriza|Fantasma/)
  })

  it('5 reales más un Ghost generan 3 + 3', () => {
    const tournament = authorizedFive()
    const round = createRound(tournament, 1, () => 0.5, ids('round'), true)
    expect(round.tables.map((table) => table.participantIds.length)).toEqual([3, 3])
  })

  it('conserva como máximo un Ghost por ronda y nunca lo duplica', () => {
    const tournament = authorizedFive()
    const round = createRound(tournament, 1, () => 0.5, ids('round'), true)
    const ghostId = tournament.participants.find((participant) => participant.isGhost)!.id
    expect(round.tables.flatMap((table) => table.participantIds).filter((id) => id === ghostId)).toHaveLength(1)
    const invalid = {
      ...round,
      tables: round.tables.map((table, index) =>
        index === 1 ? { ...table, participantIds: [...table.participantIds, ghostId] } : table,
      ),
    }
    expect(() => validateRoundAssignments(invalid, tournament.participants)).toThrow()
  })

  it('no crea PlayerResult para el Ghost ni permite registrar resultados', () => {
    const started = startTournament(setupWithPlayers(5), () => 0.5, ids('start'), true)
    const ghost = started.participants.find((participant) => participant.isGhost)!
    const table = started.rounds[0].tables.find((item) => item.participantIds.includes(ghost.id))!
    expect(table.results.some((result) => result.participantId === ghost.id)).toBe(false)
    const active = confirmRoundTables(started, started.rounds[0].id)
    expect(() => updatePlayerResult(active, active.rounds[0].id, table.id, ghost.id, { wonTable: true })).toThrow(/Fantasma/)
  })

  it('no aparece en el Standing del Tournament', () => {
    const started = startTournament(setupWithPlayers(5), () => 0.5, ids('start'), true)
    const active = confirmRoundTables(started, started.rounds[0].id)
    const saved = active.rounds[0].tables.reduce(
      (current, table) => saveTableResults(current, active.rounds[0].id, table.id),
      active,
    )
    const ghostId = saved.participants.find((participant) => participant.isGhost)!.id
    expect(calculateTournamentStanding(saved).some((entry) => entry.participantId === ghostId)).toBe(false)
    expect(calculateTournamentStanding(saved)).toHaveLength(5)
  })

  it('no aparece en el Leaderboard de liga', () => {
    const league = { ...createDefaultLeaguePeriod(ids('league')), id: 'league-ghost' }
    const setup = setupWithPlayers(5, league.id)
    const started = startTournament(setup, () => 0.5, ids('start'), true)
    const active = confirmRoundTables(started, started.rounds[0].id)
    const saved = active.rounds[0].tables.reduce(
      (current, table) => saveTableResults(current, active.rounds[0].id, table.id),
      active,
    )
    const ledger: LeaguePrizeLedger = { leaguePeriods: [league], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [] }
    expect(buildLeagueLeaderboard([saved], league, ledger)).toHaveLength(5)
    expect(buildLeagueLeaderboard([saved], league, ledger).some((entry) => entry.playerKey.startsWith('ghost:'))).toBe(false)
  })

  it('no recibe puntos especiales ni crédito', () => {
    expect(() => registerSpecialPointMovement([], 'league', 'ghost:event', 1)).toThrow(/Fantasma/)
    expect(() => registerCreditAdjustment([], 'ghost:event', 1000, 'positive', 'Error')).toThrow(/Fantasma/)
    expect(calculateAvailableCredit([{ id: 'bad', playerKey: 'ghost:event', type: 'positive_adjustment', amount: 1000, reason: 'legacy', createdAt: '', status: 'active' }], 'ghost:event')).toBe(0)
  })

  it('no aumenta prizePlayerCount ni los pozos de cinco jugadores reales', () => {
    const league = { ...createDefaultLeaguePeriod(ids('league')), id: 'league-pool' }
    const tournament = authorizeGhostPairing(setupWithPlayers(5, league.id), ids('ghost'))
    const summary = calculateTournamentPrizeSummary(tournament, league)
    expect(tournament.prizePlayerCount).toBe(5)
    expect(summary).toMatchObject({ datePrizePool: 10000, monthlyPoolContribution: 10000, totalGenerated: 20000 })
  })

  it('permite puntuar al jugador real y al Ghost como dos eliminaciones', () => {
    const started = startTournament(setupWithPlayers(5), () => 0.5, ids('start'), true)
    const active = confirmRoundTables(started, started.rounds[0].id)
    const ghostId = active.participants.find((participant) => participant.isGhost)!.id
    const table = active.rounds[0].tables.find((item) => item.participantIds.includes(ghostId))!
    const realPlayerId = table.results[0].participantId
    const withTwoEliminations = updatePlayerResult(
      active,
      active.rounds[0].id,
      table.id,
      realPlayerId,
      { eliminations: 2 },
    )
    const updatedTable = withTwoEliminations.rounds[0].tables.find((item) => item.id === table.id)!
    expect(updatedTable.results.find((result) => result.participantId === realPlayerId)?.achievementPoints).toBe(2)
    expect(() => validateTableResults(updatedTable, withTwoEliminations.participants)).not.toThrow()
    expect(() => updatePlayerResult(withTwoEliminations, active.rounds[0].id, table.id, realPlayerId, { eliminations: 3 })).toThrow(/oponentes sentados/)
  })

  it('un DROP de 6 a 5 activa la necesidad de Ghost en la siguiente ronda', () => {
    const tournament = setupWithPlayers(6)
    const dropped = setParticipantActive(tournament, tournament.participants[0].id, false)
    expect(requiresGhostPairing(dropped)).toBe(true)
  })

  it('volver a 6 jugadores elimina la necesidad y no sienta al Ghost', () => {
    const authorized = authorizeGhostPairing(setupWithPlayers(5), ids('ghost'))
    const withSix = importParticipants(authorized, 'Jugador 6', ids('sixth')).tournament
    expect(requiresGhostPairing(withSix)).toBe(false)
    const round = createRound(withSix, 1, () => 0.5, ids('round'))
    expect(round.tables.flatMap((table) => table.participantIds).some((id) => authorized.participants.find((participant) => participant.id === id)?.isGhost)).toBe(false)
  })

  it('conserva el Ghost dentro del historial de la ronda', () => {
    const started = startTournament(setupWithPlayers(5), () => 0.5, ids('start'), true)
    const ghostId = started.participants.find((participant) => participant.isGhost)!.id
    expect(started.rounds[0].tables.flatMap((table) => table.participantIds)).toContain(ghostId)
  })

  it('permite intercambiar el Ghost y mantiene dos mesas válidas', () => {
    const tournament = authorizedFive()
    const round = createRound(tournament, 1, () => 0.5, ids('round'), true)
    const pending = { ...tournament, status: 'active' as const, currentRound: 1, rounds: [round] }
    const ghostId = tournament.participants.find((participant) => participant.isGhost)!.id
    const ghostTable = round.tables.find((table) => table.participantIds.includes(ghostId))!
    const otherTable = round.tables.find((table) => table.id !== ghostTable.id)!
    const swapped = swapRoundPlayers(pending, round.id, ghostId, otherTable.participantIds[0])
    const idsAfter = swapped.rounds[0].tables.flatMap((table) => table.participantIds)
    expect(swapped.rounds[0].tables.map((table) => table.participantIds.length)).toEqual([3, 3])
    expect(new Set(idsAfter).size).toBe(6)
    expect(idsAfter.filter((id) => id === ghostId)).toHaveLength(1)
  })

  it('rota primero a jugadores que no compartieron mesa con el Ghost', () => {
    const tournament = authorizedFive()
    const first = createRound(tournament, 1, () => 0.5, ids('round-1'), true)
    const ghostId = tournament.participants.find((participant) => participant.isGhost)!.id
    const firstExposed = new Set(first.tables.find((table) => table.participantIds.includes(ghostId))!.participantIds.filter((id) => id !== ghostId))
    const second = createRound({ ...tournament, rounds: [first] }, 2, () => 0.5, ids('round-2'), true)
    const secondExposed = second.tables.find((table) => table.participantIds.includes(ghostId))!.participantIds.filter((id) => id !== ghostId)
    expect(secondExposed.every((id) => !firstExposed.has(id))).toBe(true)
  })

  it('persiste isGhost y la mesa histórica al serializar', () => {
    const started = startTournament(setupWithPlayers(5), () => 0.5, ids('start'), true)
    const restored = deserializeTournament(serializeTournament(started))!
    const ghost = restored.participants.find((participant) => participant.isGhost)
    expect(ghost).toBeDefined()
    expect(restored.rounds[0].tables.flatMap((table) => table.participantIds)).toContain(ghost!.id)
  })
})
