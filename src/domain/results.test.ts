import { describe, expect, it } from 'vitest'
import { calculateLeaderboard } from './leaderboard'
import { importParticipants, setParticipantActive } from './participants'
import {
  beginRoundCorrection,
  beginTableCorrection,
  saveTableResults,
  updatePlayerResult,
  validateTableResults,
} from './results'
import { finishRound, generateNextRound, isRoundComplete } from './rounds'
import { confirmRoundTables } from './tables'
import { createTournament, startTournament } from './tournamentOperations'
import type { IdFactory, Tournament } from './tournament'

function sequentialIds(): IdFactory {
  let value = 0
  return (prefix) => `${prefix}-${++value}`
}

function scopedSequentialIds(scope: string): IdFactory {
  let value = 0
  return (prefix) => `${scope}-${prefix}-${++value}`
}

function activeTournament(totalRounds = 3): Tournament {
  const tournament = createTournament(
    {
      name: 'Sprint 3',
      date: '2026-08-13',
      totalRounds,
      rotating1: 'Uno',
      rotating2: 'Dos',
      rotating3: 'Tres',
      prizePool: 30000,
      percentagesByPosition: [50, 30, 20],
    },
    sequentialIds(),
  )
  const withPlayers = importParticipants(
    tournament,
    'Ana\nBeto\nCarla\nDiego\nElena\nFabián\nGloria\nHugo',
    sequentialIds(),
  ).tournament
  const started = startTournament(withPlayers, () => 0.5, sequentialIds())
  return confirmRoundTables(started, started.rounds[0].id)
}

function saveEveryTable(tournament: Tournament): Tournament {
  const round = tournament.rounds.find((item) => item.number === tournament.currentRound)
  if (!round) throw new Error('Ronda de prueba ausente')
  return round.tables.reduce(
    (current, table) => saveTableResults(current, round.id, table.id),
    tournament,
  )
}

describe('resultados y estado de mesa', () => {
  it.each([0, 1, 2, 3])('acepta %s eliminaciones y calcula el total', (eliminations) => {
    const tournament = activeTournament()
    const round = tournament.rounds[0]
    const table = round.tables[0]
    const participantId = table.participantIds[0]
    const updated = updatePlayerResult(
      tournament,
      round.id,
      table.id,
      participantId,
      { eliminations },
    )

    expect(updated.rounds[0].tables[0].results[0].achievementPoints).toBe(eliminations)
  })

  it.each([-1, 4, 1.5])('rechaza eliminaciones inválidas: %s', (eliminations) => {
    const tournament = activeTournament()
    const round = tournament.rounds[0]
    const table = round.tables[0]

    expect(() =>
      updatePlayerResult(tournament, round.id, table.id, table.participantIds[0], { eliminations }),
    ).toThrow(/eliminaciones/)
  })

  it('guarda la mesa, conserva una instantánea y habilita el cierre sólo al guardar todas', () => {
    const tournament = activeTournament()
    const round = tournament.rounds[0]
    const firstTable = round.tables[0]
    const withResult = updatePlayerResult(
      tournament,
      round.id,
      firstTable.id,
      firstTable.participantIds[0],
      { rotating1: true, eliminations: 2 },
    )
    const firstSaved = saveTableResults(withResult, round.id, firstTable.id)

    expect(firstSaved.rounds[0].tables[0].status).toBe('saved')
    expect(firstSaved.rounds[0].tables[0].savedResults[0].achievementPoints).toBe(3)
    expect(isRoundComplete(firstSaved, round.id)).toBe(false)

    const allSaved = saveEveryTable(firstSaved)
    expect(isRoundComplete(allSaved, round.id)).toBe(true)
    expect(finishRound(allSaved, round.id).rounds[0].status).toBe('finished')
  })

  it('detecta resultados faltantes, ajenos, duplicados y más de un ganador', () => {
    const tournament = activeTournament()
    const table = tournament.rounds[0].tables[0]

    expect(() => validateTableResults({ ...table, results: table.results.slice(1) })).toThrow(/cada jugador/)
    expect(() =>
      validateTableResults({
        ...table,
        results: table.results.map((result, index) =>
          index === 0 ? { ...result, participantId: 'ajeno' } : result,
        ),
      }),
    ).toThrow(/exactamente/)
    expect(() =>
      validateTableResults({
        ...table,
        results: table.results.map((result, index) =>
          index === 1 ? { ...result, participantId: table.results[0].participantId } : result,
        ),
      }),
    ).toThrow(/duplicados/)
    expect(() =>
      validateTableResults({
        ...table,
        results: table.results.map((result, index) => ({ ...result, wonTable: index < 2 })),
      }),
    ).toThrow(/Solo un jugador/)
  })

  it('mantiene el leaderboard confirmado durante una edición y recalcula al guardar', () => {
    const tournament = activeTournament()
    const round = tournament.rounds[0]
    const table = round.tables[0]
    const participantId = table.participantIds[0]
    const initialResult = updatePlayerResult(
      tournament,
      round.id,
      table.id,
      participantId,
      { rotating1: true },
    )
    const saved = saveTableResults(initialResult, round.id, table.id)
    const editing = beginTableCorrection(saved, round.id, table.id)
    const correctedDraft = updatePlayerResult(
      editing,
      round.id,
      table.id,
      participantId,
      { rotating2: true },
    )

    expect(correctedDraft.rounds[0].tables[0].status).toBe('edited')
    expect(calculateLeaderboard(correctedDraft)[0].achievementPoints).toBe(1)

    const corrected = saveTableResults(correctedDraft, round.id, table.id)
    expect(corrected.rounds[0].tables[0].status).toBe('saved')
    expect(corrected.rounds[0].tables[0].editCount).toBe(1)
    expect(calculateLeaderboard(corrected)[0].achievementPoints).toBe(2)
  })

  it('reabre explícitamente una ronda finalizada para corregir y exige guardarla otra vez', () => {
    const tournament = activeTournament()
    const round = tournament.rounds[0]
    const finished = finishRound(saveEveryTable(tournament), round.id)
    const reopened = beginTableCorrection(
      beginRoundCorrection(finished, round.id),
      round.id,
      round.tables[0].id,
    )

    expect(reopened.rounds[0].status).toBe('finished')
    expect(reopened.rounds[0].isCorrectionMode).toBe(true)
    expect(reopened.rounds[0].wasEditedAfterFinish).toBe(true)
    expect(reopened.rounds[0].tables[0].status).toBe('edited')
    expect(isRoundComplete(reopened, round.id)).toBe(false)
  })
})

describe('avance entre rondas', () => {
  it('excluye DROP de la ronda siguiente y conserva sus resultados previos', () => {
    const tournament = activeTournament(2)
    const firstRound = tournament.rounds[0]
    const firstTable = firstRound.tables[0]
    const droppedId = firstTable.participantIds[0]
    const withPoints = updatePlayerResult(
      tournament,
      firstRound.id,
      firstTable.id,
      droppedId,
      { rotating1: true },
    )
    const finished = finishRound(saveEveryTable(withPoints), firstRound.id)
    const dropped = setParticipantActive(finished, droppedId, false)
    const next = generateNextRound(dropped, () => 0.5, scopedSequentialIds('next'))
    const nextRoundIds = next.rounds[1].tables.flatMap((table) => table.participantIds)

    expect(nextRoundIds).not.toContain(droppedId)
    expect(nextRoundIds).toHaveLength(7)
    expect(calculateLeaderboard(next).find((entry) => entry.participantId === droppedId)?.achievementPoints).toBe(1)
  })

  it('acumula resultados guardados de varias rondas', () => {
    const tournament = activeTournament(2)
    const firstRound = tournament.rounds[0]
    const participantId = firstRound.tables[0].participantIds[0]
    const firstDraft = updatePlayerResult(
      tournament,
      firstRound.id,
      firstRound.tables[0].id,
      participantId,
      { rotating1: true },
    )
    const firstFinished = finishRound(saveEveryTable(firstDraft), firstRound.id)
    const nextPending = generateNextRound(firstFinished, () => 0.5, scopedSequentialIds('next'))
    const nextActive = confirmRoundTables(nextPending, nextPending.rounds[1].id)
    const secondRound = nextActive.rounds[1]
    const secondTable = secondRound.tables.find((table) => table.participantIds.includes(participantId))
    if (!secondTable) throw new Error('El participante no fue asignado')
    const secondDraft = updatePlayerResult(
      nextActive,
      secondRound.id,
      secondTable.id,
      participantId,
      { rotating2: true },
    )
    const secondSaved = saveEveryTable(secondDraft)

    expect(
      calculateLeaderboard(secondSaved).find((entry) => entry.participantId === participantId),
    ).toMatchObject({ achievementPoints: 2, savedTables: 2 })
  })
})
