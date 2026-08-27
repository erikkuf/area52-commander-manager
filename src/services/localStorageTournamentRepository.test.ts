import { describe, expect, it } from 'vitest'
import { importParticipants } from '../domain/participants'
import { beginTableCorrection, saveTableResults, updatePlayerResult } from '../domain/results'
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
    legacyTournament.participants.forEach((participant: Record<string, unknown>) => {
      delete participant.isGhost
    })
    legacyTournament.rounds.forEach((round: Record<string, unknown>) => {
      delete round.isCorrectionMode
      delete round.wasEditedAfterFinish
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
    expect(restored?.rounds[0]).toMatchObject({ isCorrectionMode: false, wasEditedAfterFinish: false })
    expect(restored).toMatchObject({ ghostPairingAuthorized: false, financialReviewRequired: false })
    expect(restored?.pairingMode).toBe('balanced_random')
    expect(TOURNAMENT_STORAGE_VERSION).toBe(8)
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
