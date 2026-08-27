import { describe, expect, it } from 'vitest'
import {
  assessChampionSnapshotReadiness,
  assessOfficialChampionUpdateReadiness,
  buildLeagueChampionSnapshot,
  createMissingLeagueChampionSnapshot,
  currentChampionDiffers,
  updateChampionSnapshotMetadata,
  updateOfficialLeagueChampion,
} from './hallOfFame'
import {
  buildLeagueLeaderboard,
  buildTheoreticalLeagueLeaderboard,
  finishLeaguePeriod,
  reopenLeaguePeriod,
} from './league'
import { importParticipants } from './participants'
import { createDefaultLeaguePeriod, upsertLeaguePoolContribution } from './prizes'
import { saveTableResults, updatePlayerResult } from './results'
import { finalizeTournament, finishRound } from './rounds'
import { registerSpecialPointMovement } from './specialPoints'
import { confirmRoundTables } from './tables'
import { createTournament, startTournament } from './tournamentOperations'
import type {
  ChampionPhotoReference,
  IdFactory,
  LeaguePeriod,
  LeaguePrizeLedger,
  Tournament,
} from './tournament'
import type { LeagueLeaderboardEntry } from './league'

function ids(scope: string): IdFactory {
  let value = 0
  return (prefix) => `${scope}-${prefix}-${++value}`
}

function makeFinishedDate(leaguePeriodId: string): Tournament {
  const setup = importParticipants(
    createTournament({
      name: 'Fecha oficial',
      date: '2026-08-20',
      totalRounds: 1,
      rotating1: 'Rotativo 1',
      rotating2: 'Rotativo 2',
      rotating3: 'Rotativo 3',
      type: 'league_date',
      prizeMode: 'league_auto',
      leaguePeriodId,
      prizePool: 0,
      percentagesByPosition: [50, 30, 20],
    }, ids('tournament')),
    'Ana Campeona\nBeto Segundo\nCarla Tercera',
    ids('players'),
  ).tournament
  let active = startTournament(setup, () => 0.5, ids('round'))
  active = confirmRoundTables(active, active.rounds[0].id)
  const table = active.rounds[0].tables[0]
  active = updatePlayerResult(
    active,
    active.rounds[0].id,
    table.id,
    active.participants[0].id,
    { rotating1: true, wonTable: true, eliminations: 2, survived: true },
  )
  active = saveTableResults(active, active.rounds[0].id, table.id)
  return finalizeTournament(finishRound(active, active.rounds[0].id))
}

function scenario() {
  const league: LeaguePeriod = {
    ...createDefaultLeaguePeriod(ids('league'), '2026-08-01T12:00:00.000Z'),
    id: 'league-hall',
    name: 'Liga Histórica de Agosto',
  }
  const tournament = makeFinishedDate(league.id)
  const ana = tournament.participants.find((participant) => participant.name === 'Ana Campeona')!
  let ledger: LeaguePrizeLedger = upsertLeaguePoolContribution(
    {
      leaguePeriods: [league],
      contributions: [],
      creditMovements: [],
      specialPointMovements: registerSpecialPointMovement(
        [],
        league.id,
        ana.playerKey,
        2,
        'Comunidad',
        ids('special'),
        '2026-08-21T12:00:00.000Z',
      ),
      championSnapshots: [],
    },
    tournament,
    league,
    ids('contribution'),
  )
  ledger = finishLeaguePeriod(
    ledger,
    league.id,
    [tournament],
    ids('finish'),
    '2026-08-31T23:00:00.000Z',
  )
  return { league: ledger.leaguePeriods[0], tournament, ledger, ana }
}

function fakeEntry(
  playerKey: string,
  playerName: string,
  values: Partial<LeagueLeaderboardEntry> = {},
): LeagueLeaderboardEntry {
  return {
    playerKey,
    playerName,
    position: 1,
    leaguePoints: 10,
    achievementPoints: 10,
    specialLeaguePoints: 0,
    participations: 1,
    dateCreditEarned: 0,
    theoreticalDateCredit: 0,
    dateCreditDifference: 0,
    monthlyPrize: 0,
    monthlyPrizeStatus: 'final',
    totalCredit: 0,
    totalCreditStatus: 'final',
    tableWins: 1,
    eliminations: 2,
    ...values,
  }
}

describe('Hall of Fame y snapshots oficiales', () => {
  it('finalizar una liga crea un único snapshot desde la posición 1', () => {
    const { ledger, ana } = scenario()
    expect(ledger.championSnapshots).toHaveLength(1)
    expect(ledger.championSnapshots[0]).toMatchObject({
      leaguePeriodId: 'league-hall',
      playerKey: ana.playerKey,
      playerName: 'Ana Campeona',
      leagueName: 'Liga Histórica de Agosto',
      finalPosition: 1,
      sourceClosedAt: '2026-08-31T23:00:00.000Z',
    })
  })

  it('conserva puntos, logros, especiales, fechas, victorias y eliminaciones oficiales', () => {
    const { ledger } = scenario()
    const snapshot = ledger.championSnapshots[0]
    expect(snapshot).toMatchObject({
      leaguePoints: 9,
      achievementPoints: 7,
      specialLeaguePoints: 2,
      tournamentsPlayed: 1,
      tableWins: 1,
      eliminations: 2,
    })
  })

  it('finalizar dos veces es idempotente y no duplica el snapshot', () => {
    const { ledger, tournament } = scenario()
    const twice = finishLeaguePeriod(ledger, 'league-hall', [tournament], ids('again'))
    expect(twice).toEqual(ledger)
    expect(twice.championSnapshots).toHaveLength(1)
  })

  it('playerName y leagueName permanecen históricos aunque cambien las fuentes', () => {
    const { ledger, tournament } = scenario()
    const changedTournament = {
      ...tournament,
      participants: tournament.participants.map((participant) =>
        participant.name === 'Ana Campeona'
          ? { ...participant, name: 'Nombre nuevo' }
          : participant,
      ),
    }
    const changedPeriod = { ...ledger.leaguePeriods[0], name: 'Nombre nuevo de liga' }
    expect(changedTournament.participants[0].name).toBe('Nombre nuevo')
    expect(changedPeriod.name).toBe('Nombre nuevo de liga')
    expect(ledger.championSnapshots[0]).toMatchObject({
      playerName: 'Ana Campeona',
      leagueName: 'Liga Histórica de Agosto',
    })
  })

  it('una liga histórica finalizada puede generar su snapshot faltante', () => {
    const { ledger, tournament } = scenario()
    const withoutSnapshot = { ...ledger, championSnapshots: [] }
    const period = withoutSnapshot.leaguePeriods[0]
    const standings = buildLeagueLeaderboard([tournament], period, withoutSnapshot)
    const restored = createMissingLeagueChampionSnapshot(
      withoutSnapshot,
      period,
      standings,
      [tournament],
      ids('historic'),
    )
    expect(restored.championSnapshots[0].playerName).toBe('Ana Campeona')
  })

  it('una revisión pendiente impide generación histórica automática insegura', () => {
    const { ledger, tournament } = scenario()
    const period = { ...ledger.leaguePeriods[0], financialReviewRequired: true }
    const withoutSnapshot = {
      ...ledger,
      leaguePeriods: [period],
      championSnapshots: [],
    }
    const standings = buildLeagueLeaderboard([tournament], period, withoutSnapshot)
    expect(assessChampionSnapshotReadiness(period, standings, [tournament])).toMatchObject({
      ready: false,
      reason: 'review_required',
    })
    expect(() => createMissingLeagueChampionSnapshot(
      withoutSnapshot,
      period,
      standings,
      [tournament],
    )).toThrow(/revisión pendiente/i)
  })

  it('un empate exacto sin orden oficial no genera campeón automáticamente', () => {
    const { league, tournament } = scenario()
    const period = {
      ...league,
      finalizedLeaderboardPlayerKeys: undefined,
      financialReviewRequired: false,
      reviewRequired: false,
    }
    const first = tournament.participants[0]
    const second = tournament.participants[1]
    const tied = [
      fakeEntry(first.playerKey, first.name),
      fakeEntry(second.playerKey, second.name, { position: 2 }),
    ]
    expect(assessChampionSnapshotReadiness(period, tied, [tournament])).toMatchObject({
      ready: false,
      reason: 'unresolved_tie',
    })
  })

  it('reabrir y cambiar el Leaderboard no reemplaza el snapshot', () => {
    const { ledger } = scenario()
    const reopened = reopenLeaguePeriod(ledger, 'league-hall')
    expect(reopened.championSnapshots).toEqual(ledger.championSnapshots)
    expect(currentChampionDiffers(
      ledger.championSnapshots[0],
      [fakeEntry('player-new', 'Nueva campeona')],
    )).toBe(true)
  })

  it('actualizar campeón exige la función explícita y no modifica CreditMovement', () => {
    const { ledger, tournament } = scenario()
    const snapshot = ledger.championSnapshots[0]
    const beto = tournament.participants[1]
    const current = [
      fakeEntry(beto.playerKey, beto.name, { leaguePoints: 12, achievementPoints: 12 }),
      fakeEntry(snapshot.playerKey, snapshot.playerName, { position: 2 }),
    ]
    const movementsBefore = ledger.creditMovements
    const updated = updateOfficialLeagueChampion(
      ledger,
      snapshot.id,
      ledger.leaguePeriods[0],
      current,
      [tournament],
    )
    expect(updated.championSnapshots[0]).toMatchObject({
      playerKey: beto.playerKey,
      playerName: 'Beto Segundo',
      leaguePoints: 12,
    })
    expect(updated.creditMovements).toEqual(movementsBefore)
  })

  it('separa el campeón oficial del líder teórico después de una corrección', () => {
    const { ledger, tournament, ana } = scenario()
    const snapshot = ledger.championSnapshots[0]
    const beto = tournament.participants.find(
      (participant) => participant.name === 'Beto Segundo',
    )!
    const correctedTournament: Tournament = {
      ...tournament,
      rounds: tournament.rounds.map((round) => ({
        ...round,
        tables: round.tables.map((table) => ({
          ...table,
          results: table.results.map((result) => ({
            ...result,
            rotating1: result.participantId === beto.id,
            wonTable: result.participantId === beto.id,
            eliminations: result.participantId === beto.id ? 2 : 0,
            survived: result.participantId === beto.id,
            achievementPoints: result.participantId === beto.id ? 7 : 0,
          })),
          savedResults: table.savedResults.map((result) => ({
            ...result,
            rotating1: result.participantId === beto.id,
            wonTable: result.participantId === beto.id,
            eliminations: result.participantId === beto.id ? 2 : 0,
            survived: result.participantId === beto.id,
            achievementPoints: result.participantId === beto.id ? 7 : 0,
          })),
        })),
      })),
    }
    const correctedLedger: LeaguePrizeLedger = {
      ...ledger,
      leaguePeriods: ledger.leaguePeriods.map((period) => ({
        ...period,
        reviewRequired: true,
        financialReviewRequired: true,
      })),
    }
    const period = correctedLedger.leaguePeriods[0]
    const official = buildLeagueLeaderboard(
      [correctedTournament],
      period,
      correctedLedger,
    )
    const theoretical = buildTheoreticalLeagueLeaderboard(
      [correctedTournament],
      period,
      correctedLedger,
    )

    expect(snapshot.playerKey).toBe(ana.playerKey)
    expect(official[0].playerKey).toBe(ana.playerKey)
    expect(theoretical[0].playerKey).toBe(beto.playerKey)
    expect(currentChampionDiffers(snapshot, theoretical)).toBe(true)
    expect(correctedLedger.championSnapshots[0].playerKey).toBe(ana.playerKey)

    const movementsBefore = correctedLedger.creditMovements
    const updated = updateOfficialLeagueChampion(
      correctedLedger,
      snapshot.id,
      period,
      theoretical,
      [correctedTournament],
    )
    expect(updated.championSnapshots[0]).toMatchObject({
      playerKey: beto.playerKey,
      playerName: 'Beto Segundo',
      leaguePoints: 7,
    })
    expect(updated.creditMovements).toEqual(movementsBefore)
    expect(updated.leaguePeriods[0].financialReviewRequired).toBe(true)
  })

  it('no actualiza al campeón oficial desde un empate teórico sin resolución', () => {
    const { ledger, tournament } = scenario()
    const snapshot = ledger.championSnapshots[0]
    const period = {
      ...ledger.leaguePeriods[0],
      administrativeLeaderboardPlayerKeys: undefined,
    }
    const beto = tournament.participants.find(
      (participant) => participant.name === 'Beto Segundo',
    )!
    const tied = [
      fakeEntry(beto.playerKey, beto.name),
      fakeEntry(snapshot.playerKey, snapshot.playerName, { position: 2 }),
    ]

    expect(assessOfficialChampionUpdateReadiness(period, tied, [tournament])).toMatchObject({
      ready: false,
      reason: 'unresolved_tie',
    })
    expect(() => updateOfficialLeagueChampion(
      ledger,
      snapshot.id,
      period,
      tied,
      [tournament],
    )).toThrow(/empate exacto/i)
  })

  it('una foto anterior no se asigna al nuevo campeón', () => {
    const { ledger, tournament } = scenario()
    const snapshot = ledger.championSnapshots[0]
    const photo: ChampionPhotoReference = {
      id: 'photo-1',
      fileName: 'ana.webp',
      mimeType: 'image/webp',
      storageKey: 'champion-photo:ana',
    }
    const withMetadata = updateChampionSnapshotMetadata(ledger, snapshot.id, {
      championPhoto: photo,
      commanderName: 'Muldrotha',
      deckName: 'Reciclando',
      deckUrl: 'https://example.com/deck',
    })
    const beto = tournament.participants[1]
    const updated = updateOfficialLeagueChampion(
      withMetadata,
      snapshot.id,
      ledger.leaguePeriods[0],
      [fakeEntry(beto.playerKey, beto.name)],
      [tournament],
    )
    expect(updated.championSnapshots[0]).toMatchObject({ playerKey: beto.playerKey })
    expect(updated.championSnapshots[0].championPhoto).toBeUndefined()
    expect(updated.championSnapshots[0].commanderName).toBeUndefined()
    expect(updated.creditMovements).toEqual(ledger.creditMovements)
  })

  it('metadata y foto son opcionales y editarlas no cambia deporte ni crédito', () => {
    const { ledger } = scenario()
    const snapshot = ledger.championSnapshots[0]
    const updated = updateChampionSnapshotMetadata(ledger, snapshot.id, {
      commanderName: '  Atraxa  ',
      deckName: 'Contadores',
      deckUrl: 'https://example.com/atraxa',
    })
    expect(updated.championSnapshots[0]).toMatchObject({
      commanderName: 'Atraxa',
      deckName: 'Contadores',
      deckUrl: 'https://example.com/atraxa',
      leaguePoints: snapshot.leaguePoints,
    })
    expect(updated.championSnapshots[0].championPhoto).toBeUndefined()
    expect(updated.creditMovements).toEqual(ledger.creditMovements)
  })

  it('el Jugador Fantasma nunca puede generar un snapshot', () => {
    const { league, tournament } = scenario()
    const ghostTournament: Tournament = {
      ...tournament,
      participants: [{
        id: 'ghost-1',
        playerKey: 'ghost-key',
        name: 'Jugador Fantasma',
        active: true,
        isGhost: true,
      }],
    }
    expect(() => buildLeagueChampionSnapshot(
      { ...league, financialReviewRequired: false, reviewRequired: false },
      [fakeEntry('ghost-key', 'Jugador Fantasma')],
      [ghostTournament],
    )).toThrow(/campeón real/i)
  })
})
