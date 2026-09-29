import { describe, expect, it } from 'vitest'
import { importParticipants } from '../domain/participants'
import {
  beginTableCorrection,
  discardRoundCorrection,
  saveTableResults,
  updatePlayerResult,
} from '../domain/results'
import { confirmRoundTables } from '../domain/tables'
import { createTournament, startTournament } from '../domain/tournamentOperations'
import {
  LocalStorageTournamentRepository,
  TOURNAMENT_STORAGE_VERSION,
  deserializeTournament,
  serializeTournament,
} from './localStorageTournamentRepository'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const tournament = startTournament(
  importParticipants(
    createTournament({
      name: 'Fecha persistida',
      date: '2026-08-13',
      totalRounds: 3,
      rotating1: 'Uno',
      rotating2: 'Dos',
      rotating3: 'Tres',
      prizePool: 30000,
      percentagesByPosition: [50, 30, 20],
    }),
    'Uno\nDos\nTres\nCuatro\nCinco\nSeis\nSiete\nOcho',
  ).tournament,
  () => 0.5,
)

describe('persistencia local', () => {
  it('serializa y recupera el estado completo', () => {
    expect(deserializeTournament(serializeTournament(tournament))).toEqual(tournament)
  })

  it('conserva el valor del snapshot dinámico aunque la regla legacy tenga otro valor', () => {
    const dynamic = {
      ...tournament,
      rotatingAchievements: tournament.rotatingAchievements.map((snapshot, index) =>
        index === 0 ? { ...snapshot, points: -2 } : snapshot,
      ),
    }
    expect(deserializeTournament(serializeTournament(dynamic))?.rotatingAchievements[0].points)
      .toBe(-2)
  })

  it('recupera ronda, resultados guardados y estado de corrección', () => {
    const active = confirmRoundTables(tournament, tournament.rounds[0].id)
    const table = active.rounds[0].tables[0]
    const withResult = updatePlayerResult(
      active,
      active.rounds[0].id,
      table.id,
      table.participantIds[0],
      { rotating1: true, eliminations: 2 },
    )
    const saved = saveTableResults(withResult, active.rounds[0].id, table.id)
    const edited = beginTableCorrection(saved, active.rounds[0].id, table.id)

    expect(deserializeTournament(serializeTournament(edited))).toEqual(edited)
  })

  it('migra snapshots de Sprint 2 agregando la instantánea de resultados', () => {
    const legacyTournament = JSON.parse(JSON.stringify(tournament))
    delete legacyTournament.prizeMode
    delete legacyTournament.type
    delete legacyTournament.prizePlayerCount
    delete legacyTournament.prizeParticipantIds
    delete legacyTournament.leaguePeriodId
    delete legacyTournament.achievementConfig
    delete legacyTournament.ghostPairingAuthorized
    delete legacyTournament.financialReviewRequired
    delete legacyTournament.pairingMode
    delete legacyTournament.penaltyMovements
    legacyTournament.participants.forEach((participant: Record<string, unknown>) => {
      delete participant.isGhost
    })
    legacyTournament.rounds.forEach((round: Record<string, unknown>) => {
      delete round.isCorrectionMode
      delete round.wasEditedAfterFinish
      delete round.wasManuallyAdjusted
    })
    legacyTournament.rounds[0].tables.forEach((table: Record<string, unknown>) => {
      delete table.savedResults
      delete table.editCount
    })
    const restored = deserializeTournament(
      JSON.stringify({ version: 1, tournament: legacyTournament }),
    )

    expect(restored?.rounds[0].tables[0].savedResults).toEqual([])
    expect(restored?.rounds[0].tables[0].editCount).toBe(0)
    expect(restored?.prizeMode).toBe('manual_credit')
    expect(restored?.type).toBe('independent')
    expect(restored?.prizePlayerCount).toBe(8)
    expect(restored?.prizeParticipantIds).toEqual(
      tournament.participants.map((participant) => participant.id),
    )
    expect(restored?.dateCreditConfig).toEqual(tournament.dateCreditConfig)
    expect(restored?.achievementConfig.win.points).toBe(3)
    expect(restored?.participants.every((participant) => participant.isGhost === false)).toBe(true)
    expect(restored?.rounds[0]).toMatchObject({
      isCorrectionMode: false,
      wasEditedAfterFinish: false,
      wasManuallyAdjusted: false,
    })
    expect(restored).toMatchObject({ ghostPairingAuthorized: false, financialReviewRequired: false })
    expect(restored?.pairingMode).toBe('balanced_random')
    expect(restored?.penaltyMovements).toEqual([])
    expect(TOURNAMENT_STORAGE_VERSION).toBe(11)
  })

  it('migra versión 10 sin penalizaciones y conserva movimientos en versión actual', () => {
    const previous = { ...tournament, penaltyMovements: undefined }
    const restored = deserializeTournament(JSON.stringify({ version: 10, tournament: previous }))
    expect(restored?.penaltyMovements).toEqual([])
    const withMovement = {
      ...tournament,
      penaltyMovements: [{
        id: 'penalty-1', tournamentId: tournament.id,
        playerKey: tournament.participants[0].playerKey,
        name: 'Falta', amount: -2, createdAt: '2026-09-22T12:00:00.000Z',
        status: 'active' as const,
      }],
    }
    expect(deserializeTournament(serializeTournament(withMovement))?.penaltyMovements)
      .toEqual(withMovement.penaltyMovements)
    expect(deserializeTournament(serializeTournament({
      ...withMovement,
      penaltyMovements: [{ ...withMovement.penaltyMovements[0], amount: 2 }],
    }))).toBeNull()
  })

  it('migra rotating1–rotating5 a IDs dinámicos sin recalcular un histórico finalizado', () => {
    const legacy = JSON.parse(JSON.stringify(tournament))
    legacy.status = 'finished'
    legacy.rotatingAchievements = [1, 2, 3, 4, 5].map((slot) => ({
      id: `rotating${slot}`,
      label: `Logro ${slot}`,
      points: slot === 5 ? -1 : slot,
    }))
    legacy.achievementConfig.rotating4 = { enabled: true, points: 4 }
    legacy.achievementConfig.rotating5 = { enabled: true, points: -1 }
    const historicalResult = legacy.rounds[0].tables[0].results[0]
    historicalResult.rotating1 = true
    historicalResult.rotating4 = true
    historicalResult.rotating5 = true
    historicalResult.achievementPoints = 99
    delete historicalResult.rotatingAchievementIds

    const restored = deserializeTournament(JSON.stringify({ version: 9, tournament: legacy }))!
    expect(restored.rotatingAchievements).toHaveLength(5)
    expect(restored.rounds[0].tables[0].results[0].rotatingAchievementIds)
      .toEqual(['rotating1', 'rotating4', 'rotating5'])
    expect(restored.rounds[0].tables[0].results[0].achievementPoints).toBe(99)
  })

  it('recupera como sesión activa una corrección antigua interrumpida', () => {
    const active = confirmRoundTables(tournament, tournament.rounds[0].id)
    const allSaved = active.rounds[0].tables.reduce(
      (current, table) => saveTableResults(current, active.rounds[0].id, table.id),
      active,
    )
    const legacy = JSON.parse(JSON.stringify(allSaved))
    legacy.rounds[0].status = 'finished'
    legacy.rounds[0].isCorrectionMode = false
    legacy.rounds[0].tables[0].status = 'edited'
    delete legacy.rounds[0].correctionBaseline

    const restored = deserializeTournament(JSON.stringify({ version: 8, tournament: legacy }))!
    expect(restored.rounds[0].isCorrectionMode).toBe(true)
    expect(restored.rounds[0].correctionBaseline).toBeDefined()
    const discarded = discardRoundCorrection(restored, restored.rounds[0].id)
    expect(discarded.rounds[0].isCorrectionMode).toBe(false)
    expect(discarded.rounds[0].tables.every((table) => table.status === 'saved')).toBe(true)
  })

  it('conserva un Ghost legado de Swiss solo como historia inactiva', () => {
    const legacy = JSON.parse(JSON.stringify(tournament))
    legacy.pairingMode = 'swiss'
    legacy.ghostPairingAuthorized = true
    legacy.participants.push({
      id: 'ghost-legacy',
      playerKey: 'ghost:legacy',
      name: 'Jugador Fantasma',
      active: true,
      isGhost: true,
    })
    const restored = deserializeTournament(JSON.stringify({ version: 8, tournament: legacy }))!
    expect(restored.participants.find((participant) => participant.id === 'ghost-legacy')).toMatchObject({
      active: false,
      isGhost: true,
    })
    expect(restored.ghostPairingAuthorized).toBe(false)
  })

  it('rechaza snapshots inválidos sin romper la aplicación', () => {
    expect(deserializeTournament('{invalido')).toBeNull()
    expect(deserializeTournament(JSON.stringify({ version: 99, tournament }))).toBeNull()
  })

  it('migra una fecha de liga anterior al TournamentType correcto', () => {
    const legacyLeagueDate = JSON.parse(JSON.stringify(tournament))
    delete legacyLeagueDate.type
    legacyLeagueDate.prizeMode = 'league_auto'
    legacyLeagueDate.leaguePeriodId = 'league-legacy'

    const restored = deserializeTournament(
      JSON.stringify({ version: 3, tournament: legacyLeagueDate }),
    )
    expect(restored?.type).toBe('league_date')
    expect(restored?.leaguePeriodId).toBe('league-legacy')
  })

  it('preserva totales históricos y win=1 al migrar un torneo finalizado antiguo', () => {
    const legacyFinished = JSON.parse(JSON.stringify(tournament))
    legacyFinished.status = 'finished'
    delete legacyFinished.achievementConfig
    const result = legacyFinished.rounds[0].tables[0].results[0]
    result.wonTable = true
    result.achievementPoints = 1
    legacyFinished.rounds[0].tables[0].status = 'saved'
    legacyFinished.rounds[0].tables[0].savedResults = [{ ...result }]

    const restored = deserializeTournament(JSON.stringify({ version: 4, tournament: legacyFinished }))
    expect(restored?.achievementConfig.win.points).toBe(1)
    expect(restored?.rounds[0].tables[0].results[0].achievementPoints).toBe(1)
  })

  it('guarda, recupera y elimina usando el contrato del repositorio', async () => {
    const repository = new LocalStorageTournamentRepository(new MemoryStorage())
    await repository.saveTournament(tournament)
    expect(await repository.getCurrentTournament()).toEqual(tournament)

    await repository.clearCurrentTournament()
    expect(await repository.getCurrentTournament()).toBeNull()
  })
})
