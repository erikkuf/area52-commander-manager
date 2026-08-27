import { describe, expect, it } from 'vitest'
import { setParticipantActive } from './participants'
import { confirmRoundTables, createRound, distributeTableSizes, swapRoundPlayers } from './tables'
import { createTournament } from './tournamentOperations'
import type { IdFactory, Participant, TournamentConfigInput } from './tournament'

const expectedSizes: Record<number, number[]> = {
  8: [4, 4],
  9: [3, 3, 3],
  10: [4, 3, 3],
  11: [4, 4, 3],
  12: [4, 4, 4],
  13: [4, 3, 3, 3],
  14: [4, 4, 3, 3],
  15: [4, 4, 4, 3],
  16: [4, 4, 4, 4],
}

const config: TournamentConfigInput = {
  name: 'Torneo de prueba',
  date: '2026-08-13',
  totalRounds: 3,
  rotating1: 'R1',
  rotating2: 'R2',
  rotating3: 'R3',
  prizePool: 30000,
  percentagesByPosition: [50, 30, 20],
}

function sequentialIds(): IdFactory {
  let value = 0
  return (prefix) => `${prefix}-${++value}`
}

function participants(count: number): Participant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    playerKey: `player-${index + 1}`,
    name: `Jugador ${index + 1}`,
    active: true,
    isGhost: false,
  }))
}

function tournamentWithPlayers(count: number) {
  return { ...createTournament(config, sequentialIds()), participants: participants(count) }
}

describe('distributeTableSizes', () => {
  it.each(Object.entries(expectedSizes))('distribuye %s jugadores según la especificación', (count, sizes) => {
    expect(distributeTableSizes(Number(count))).toEqual(sizes)
  })

  it('produce únicamente mesas válidas entre 3 y 40 jugadores cuando existe solución', () => {
    for (let playerCount = 3; playerCount <= 40; playerCount += 1) {
      if (playerCount === 5) {
        expect(() => distributeTableSizes(playerCount)).toThrow(/No existe una distribución válida/)
        continue
      }

      const sizes = distributeTableSizes(playerCount)
      expect(sizes.reduce((total, size) => total + size, 0)).toBe(playerCount)
      expect(sizes.every((size) => size === 3 || size === 4)).toBe(true)
      expect(sizes.filter((size) => size === 4).length).toBe(
        Math.max(
          ...Array.from({ length: Math.floor(playerCount / 4) + 1 }, (_, value) => value).filter(
            (tablesOfFour) => (playerCount - tablesOfFour * 4) >= 0 && (playerCount - tablesOfFour * 4) % 3 === 0,
          ),
        ),
      )
    }
  })

  it.each([0, 1, 2])('rechaza %s jugadores', (playerCount) => {
    expect(() => distributeTableSizes(playerCount)).toThrow(/al menos 3 jugadores activos/)
  })
})

describe('createRound', () => {
  it('asigna a cada jugador activo exactamente una vez', () => {
    const tournament = tournamentWithPlayers(40)
    const round = createRound(tournament, 1, () => 0.42, sequentialIds())
    const assignedIds = round.tables.flatMap((table) => table.participantIds)

    expect(assignedIds).toHaveLength(40)
    expect(new Set(assignedIds).size).toBe(40)
    expect(new Set(assignedIds)).toEqual(new Set(tournament.participants.map((player) => player.id)))
  })

  it('excluye jugadores DROP al generar una ronda futura sin alterar el participante', () => {
    const original = tournamentWithPlayers(8)
    const dropped = setParticipantActive(original, 'player-3', false)
    const round = createRound(dropped, 2, () => 0.25, sequentialIds())
    const assignedIds = round.tables.flatMap((table) => table.participantIds)

    expect(dropped.participants.find((player) => player.id === 'player-3')?.active).toBe(false)
    expect(assignedIds).not.toContain('player-3')
    expect(assignedIds).toHaveLength(7)
  })

  it('intercambia dos jugadores de mesas distintas sin duplicarlos ni cambiar tamaños', () => {
    const base = tournamentWithPlayers(8)
    const firstRound = createRound(base, 1, () => 0.5, sequentialIds())
    const activeTournament = { ...base, status: 'active' as const, currentRound: 1, rounds: [firstRound] }
    const firstPlayer = firstRound.tables[0].participantIds[0]
    const secondPlayer = firstRound.tables[1].participantIds[0]

    const swapped = swapRoundPlayers(activeTournament, firstRound.id, firstPlayer, secondPlayer)
    const swappedRound = swapped.rounds[0]
    const assignedIds = swappedRound.tables.flatMap((table) => table.participantIds)

    expect(swappedRound.tables.map((table) => table.participantIds.length)).toEqual([4, 4])
    expect(swappedRound.tables[0].participantIds).toContain(secondPlayer)
    expect(swappedRound.tables[1].participantIds).toContain(firstPlayer)
    expect(new Set(assignedIds).size).toBe(8)
  })

  it('confirma la ronda existente sin sentar silenciosamente una inscripción tardía', () => {
    const base = tournamentWithPlayers(8)
    const firstRound = createRound(base, 1, () => 0.5, sequentialIds())
    const latePlayer = {
      id: 'late-player',
      playerKey: 'late-player',
      name: 'Jugador tardío',
      active: true,
      isGhost: false,
    }
    const tournament = {
      ...base,
      status: 'active' as const,
      currentRound: 1,
      participants: [...base.participants, latePlayer],
      rounds: [firstRound],
    }

    const confirmed = confirmRoundTables(tournament, firstRound.id)
    expect(confirmed.rounds[0].status).toBe('active')
    expect(confirmed.rounds[0].tables.flatMap((table) => table.participantIds)).not.toContain(
      latePlayer.id,
    )
  })
})
