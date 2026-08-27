import { describe, expect, it } from 'vitest'
import { importParticipants, setParticipantActive } from './participants'
import { createPairingTables, inspectPairing } from './pairing'
import { createRound, distributeTableSizes } from './tables'
import type { IdFactory, Participant, Round, Tournament, TournamentConfigInput } from './tournament'
import { createTournament } from './tournamentOperations'

function ids(scope: string): IdFactory {
  let value = 0
  return (prefix) => `${scope}-${prefix}-${++value}`
}

function seededRandom(seed = 1): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function config(
  pairingMode: TournamentConfigInput['pairingMode'],
  type: TournamentConfigInput['type'] = 'independent',
): TournamentConfigInput {
  return {
    name: `Evento ${pairingMode}`,
    date: '2026-08-20',
    totalRounds: 5,
    pairingMode,
    rotating1: 'R1',
    rotating2: 'R2',
    rotating3: 'R3',
    type,
    prizeMode: type === 'league_date' ? 'league_auto' : 'none',
    leaguePeriodId: type === 'league_date' ? 'league-1' : undefined,
    prizePool: 0,
    percentagesByPosition: [50, 30, 20],
  }
}

function tournamentWithPlayers(
  count: number,
  pairingMode: TournamentConfigInput['pairingMode'] = 'balanced_random',
): Tournament {
  const tournament = createTournament(config(pairingMode), ids(`create-${pairingMode}`))
  return importParticipants(
    tournament,
    Array.from({ length: count }, (_, index) => `Jugador ${index + 1}`).join('\n'),
    ids(`players-${pairingMode}`),
  ).tournament
}

function participantsForRound(tournament: Tournament, round: Round): Participant[][] {
  const byId = new Map(tournament.participants.map((participant) => [participant.id, participant]))
  return round.tables.map((table) =>
    table.participantIds.map((participantId) => byId.get(participantId)!),
  )
}

function commitScores(round: Round, scores: Map<string, number>): Round {
  return {
    ...round,
    status: 'finished',
    tables: round.tables.map((table) => {
      const results = table.results.map((result) => ({
        ...result,
        achievementPoints: scores.get(result.participantId) ?? 0,
      }))
      return { ...table, status: 'saved', results, savedResults: results }
    }),
  }
}

describe('emparejamiento configurable', () => {
  it('permite seleccionar los dos modos tanto en fechas de liga como en independientes', () => {
    expect(createTournament(config('balanced_random')).pairingMode).toBe('balanced_random')
    expect(createTournament(config('swiss')).pairingMode).toBe('swiss')
    expect(createTournament(config('swiss', 'league_date')).pairingMode).toBe('swiss')
  })

  it('el aleatorio equilibrado alcanza el mínimo de repeticiones para 12 jugadores', () => {
    const tournament = tournamentWithPlayers(12)
    const first = createRound(tournament, 1, seededRandom(11), ids('round-1'))
    const withHistory = { ...tournament, rounds: [first] }
    const second = createRound(withHistory, 2, seededRandom(12), ids('round-2'))

    const diagnostics = inspectPairing(withHistory, participantsForRound(withHistory, second))
    // Tres mesas nuevas de cuatro repartidas entre tres mesas anteriores requieren,
    // como mínimo matemático, tres parejas que ya compartieron mesa.
    expect(diagnostics.repeatedPairs).toBe(3)
    expect(diagnostics.maximumPriorMeetings).toBe(1)
  })

  it('evita repetir rivales por completo cuando existe una solución válida', () => {
    const tournament = tournamentWithPlayers(16)
    const first = createRound(tournament, 1, seededRandom(21), ids('round-1'))
    const afterFirst = { ...tournament, rounds: [first] }
    const second = createRound(afterFirst, 2, seededRandom(22), ids('round-2'))

    expect(
      inspectPairing(afterFirst, participantsForRound(afterFirst, second)).repeatedPairs,
    ).toBe(0)
  })

  it('el suizo agrupa puntajes cercanos sin sacrificar el mínimo de rematches', () => {
    const tournament = tournamentWithPlayers(8, 'swiss')
    const first = createRound(tournament, 1, seededRandom(31), ids('round-1'))
    const scores = new Map<string, number>()
    const firstTableIds = first.tables[0].participantIds
    const secondTableIds = first.tables[1].participantIds
    ;[8, 7, 4, 3].forEach((score, index) => scores.set(firstTableIds[index], score))
    ;[6, 5, 2, 1].forEach((score, index) => scores.set(secondTableIds[index], score))
    const committedFirst = commitScores(first, scores)
    const withHistory = { ...tournament, rounds: [committedFirst] }
    const second = createRound(withHistory, 2, seededRandom(32), ids('round-2'))
    const scoreGroups = second.tables
      .map((table) => table.participantIds.map((id) => scores.get(id)!).sort((a, b) => b - a))
      .sort((firstGroup, secondGroup) => secondGroup[0] - firstGroup[0])

    expect(scoreGroups).toEqual([[8, 7, 6, 5], [4, 3, 2, 1]])
    expect(
      inspectPairing(withHistory, participantsForRound(withHistory, second)).repeatedPairs,
    ).toBe(4)
  })

  it('la primera ronda suiza sigue siendo una distribución aleatoria equilibrada válida', () => {
    const tournament = tournamentWithPlayers(10, 'swiss')
    const round = createRound(tournament, 1, seededRandom(41), ids('round-1'))
    expect(round.tables.map((table) => table.participantIds.length)).toEqual([4, 3, 3])
    expect(new Set(round.tables.flatMap((table) => table.participantIds)).size).toBe(10)
  })

  it('ambos modos excluyen jugadores DROP de las rondas futuras', () => {
    for (const mode of ['balanced_random', 'swiss'] as const) {
      const tournament = tournamentWithPlayers(8, mode)
      const droppedId = tournament.participants[0].id
      const withDrop = setParticipantActive(tournament, droppedId, false)
      const tables = createPairingTables(
        withDrop,
        withDrop.participants.filter((participant) => participant.active),
        distributeTableSizes(7),
        seededRandom(51),
      )
      expect(tables.flat().some((participant) => participant.id === droppedId)).toBe(false)
    }
  })
})
