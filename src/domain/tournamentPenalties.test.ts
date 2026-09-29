import { describe, expect, it } from 'vitest'
import {
  createTournamentPenaltyDefinition,
  deleteCatalogDefinition,
  updateTournamentPenaltyDefinition,
} from './achievementCatalogs'
import { calculateTournamentStanding } from './leaderboard'
import { buildLeagueLeaderboard, consolidateTournamentPrizes, finishLeaguePeriod } from './league'
import { importParticipants } from './participants'
import { buildPlayerRegistry, mergePlayerIdentities } from './playerRegistry'
import { createDefaultLeaguePeriod } from './prizes'
import { updatePlayerResult, saveTableResults } from './results'
import { finalizeTournament, finishRound } from './rounds'
import { confirmRoundTables } from './tables'
import { createTournament, startTournament } from './tournamentOperations'
import { applyTournamentPenalty, voidTournamentPenalty } from './tournamentPenalties'
import { createEmptyWorkspace } from './workspace'
import { deserializeAppWorkspace, serializeAppWorkspace } from '../services/localStorageAppWorkspaceRepository'
import type {
  LeaguePeriod, LeaguePrizeLedger, PrizeMode, Tournament,
} from './tournament'

const now = '2026-09-22T12:00:00.000Z'
let sequence = 0
const ids = (prefix: string) => `${prefix}-${++sequence}`
const penalty = (points: number) => createTournamentPenaltyDefinition(
  { name: `Falta ${Math.abs(points)}`, description: 'Decisión del staff', points }, ids, now,
)

function event(prizeMode: PrizeMode = 'none', league?: LeaguePeriod): Tournament {
  const setup = importParticipants(createTournament({
    name: 'Fecha anónima', date: '2026-09-22', totalRounds: 1,
    rotating1: 'Uno', rotating2: 'Dos', rotating3: 'Tres',
    type: league ? 'league_date' : 'independent',
    prizeMode, leaguePeriodId: league?.id,
    prizePool: prizeMode === 'manual_credit' ? 30000 : 0,
    percentagesByPosition: [50, 30, 20],
  }, ids, league), 'Jugador A\nJugador B\nJugador C', ids).tournament
  const started = startTournament(setup, () => 0.5, ids)
  const round = started.rounds[0]
  const active = confirmRoundTables(started, round.id)
  const table = active.rounds[0].tables[0]
  const firstId = active.participants.find((player) => player.name === 'Jugador A')!.id
  const secondId = active.participants.find((player) => player.name === 'Jugador B')!.id
  const withWinner = updatePlayerResult(active, round.id, table.id, firstId, { wonTable: true })
  const withAchievement = updatePlayerResult(withWinner, round.id, table.id, secondId, { rotating1: true })
  const saved = saveTableResults(withAchievement, round.id, table.id)
  return finalizeTournament(finishRound(saved, round.id), now)
}

function ledger(league?: LeaguePeriod): LeaguePrizeLedger {
  return {
    leaguePeriods: league ? [league] : [], contributions: [], creditMovements: [],
    specialPointMovements: [], championSnapshots: [],
  }
}

function context(tournament: Tournament, prizeLedger = ledger(), league?: LeaguePeriod) {
  return { ledger: prizeLedger, leaguePeriod: league, tournaments: [tournament] }
}

function standingByName(tournament: Tournament, name: string) {
  const id = tournament.participants.find((participant) => participant.name === name)!.id
  return calculateTournamentStanding(tournament).find((entry) => entry.participantId === id)!
}

describe('penalizaciones administrativas de Tournament', () => {
  it('montos -1 y -2 reducen Standing; void revierte sin borrar el movimiento', () => {
    const original = event()
    const playerKey = original.participants[0].playerKey
    const withOne = applyTournamentPenalty(original, playerKey, penalty(-1), context(original), ids, now)
    const withTwo = applyTournamentPenalty(withOne, playerKey, penalty(-2), context(withOne), ids, now)
    expect(standingByName(withTwo, 'Jugador A')).toMatchObject({
      totalPoints: 0, achievementPoints: 3, penaltyPoints: -3,
      tableWins: 1, achievementCount: 0, eliminations: 0,
    })
    const voided = voidTournamentPenalty(withTwo, withTwo.penaltyMovements[0].id, context(withTwo), now)
    expect(standingByName(voided, 'Jugador A').totalPoints).toBe(1)
    expect(voided.penaltyMovements).toHaveLength(2)
    expect(voided.penaltyMovements[0]).toMatchObject({ status: 'void', voidedAt: now })
  })

  it('el nuevo total decide el empate antes de victorias y logros, sin alterar hechos de mesa', () => {
    const original = event()
    const playerKey = original.participants[0].playerKey
    const penalized = applyTournamentPenalty(original, playerKey, penalty(-2), context(original), ids, now)
    const first = standingByName(penalized, 'Jugador A')
    const second = standingByName(penalized, 'Jugador B')
    expect(first.totalPoints).toBe(second.totalPoints)
    expect(first.position).toBeLessThan(second.position) // victoria es el segundo criterio
    expect(first.achievementCount).toBe(0)
    expect(second.achievementCount).toBe(1)
    expect(penalized.rounds).toBe(original.rounds)
  })

  it('Leaderboard de liga incorpora la penalización solo por el Standing de la fecha', () => {
    const league = createDefaultLeaguePeriod(ids)
    const original = event('league_auto', league)
    const playerKey = original.participants[0].playerKey
    const penalized = applyTournamentPenalty(original, playerKey, penalty(-4), context(original, ledger(league), league), ids, now)
    const leaderboard = buildLeagueLeaderboard([penalized], league, ledger(league))
    expect(leaderboard[0].playerName).toBe('Jugador B')
    expect(leaderboard.find((entry) => entry.playerKey === playerKey)).toMatchObject({
      leaguePoints: -1, achievementPoints: 3, achievementCount: 0, tableWins: 1,
    })
  })

  it('el snapshot sobrevive a editar o eliminar la definición global', () => {
    const original = event()
    const definition = penalty(-2)
    const penalized = applyTournamentPenalty(
      original, original.participants[0].playerKey, definition, context(original), ids, now,
    )
    const edited = updateTournamentPenaltyDefinition(
      [definition], definition.id, { name: 'Falta revisada', points: -5 }, now,
    )
    const catalog = deleteCatalogDefinition([definition], definition.id)
    expect(edited[0].points).toBe(-5)
    expect(catalog).toEqual([])
    expect(penalized.penaltyMovements[0]).toMatchObject({
      sourceDefinitionId: definition.id, name: definition.name,
      description: definition.description, amount: -2,
    })
    expect(standingByName(penalized, 'Jugador A').totalPoints).toBe(1)
    const restored = deserializeAppWorkspace(serializeAppWorkspace({
      ...createEmptyWorkspace(), tournaments: [penalized], tournamentPenaltyCatalog: catalog,
    }))!
    expect(restored.tournamentPenaltyCatalog).toEqual([])
    expect(restored.tournaments[0].penaltyMovements[0].amount).toBe(-2)
  })

  it('solo requiere revisión cuando cambia un premio de fecha ya consolidado', () => {
    const original = event('manual_credit')
    const consolidated = consolidateTournamentPrizes(ledger(), original, undefined, ids, now)
    const key = original.participants[0].playerKey
    const minor = applyTournamentPenalty(original, key, penalty(-1), context(original, consolidated), ids, now)
    expect(minor.financialReviewRequired).toBe(false)
    const changed = applyTournamentPenalty(original, key, penalty(-4), context(original, consolidated), ids, now)
    expect(changed.financialReviewRequired).toBe(true)
    expect(changed.financialReviewResolvedAt).toBeUndefined()
    expect(consolidated.creditMovements).toHaveLength(3)
    expect(ledger().creditMovements).toEqual([])
    const reverted = voidTournamentPenalty(changed, changed.penaltyMovements[0].id, context(changed, consolidated), now)
    expect(reverted.penaltyMovements[0].status).toBe('void')
    expect(consolidated.creditMovements).toHaveLength(3)
  })

  it('anular una penalización también abre revisión si cambia crédito consolidado', () => {
    const original = event('manual_credit')
    const key = original.participants[0].playerKey
    const penalized = applyTournamentPenalty(original, key, penalty(-4), context(original), ids, now)
    expect(penalized.financialReviewRequired).toBe(false)
    const consolidated = consolidateTournamentPrizes(ledger(), penalized, undefined, ids, now)
    const voided = voidTournamentPenalty(
      penalized, penalized.penaltyMovements[0].id, context(penalized, consolidated), now,
    )
    expect(voided.financialReviewRequired).toBe(true)
    expect(voided.penaltyMovements[0].status).toBe('void')
    expect(consolidated.creditMovements).toHaveLength(3)
  })

  it('un torneo sin pozo nunca activa revisión financiera por la penalización', () => {
    const original = event('none')
    const penalized = applyTournamentPenalty(
      original, original.participants[0].playerKey, penalty(-4), context(original), ids, now,
    )
    expect(standingByName(penalized, 'Jugador B').position).toBe(1)
    expect(penalized.financialReviewRequired).toBe(false)
  })

  it('rechaza montos cero, positivos, decimales y definiciones desactivadas', () => {
    expect(() => createTournamentPenaltyDefinition({ name: 'Inválida', points: 0 }))
      .toThrow(/entero distinto de 0/)
    expect(() => createTournamentPenaltyDefinition({ name: 'Inválida', points: 1 }))
      .toThrow(/negativos/)
    expect(() => createTournamentPenaltyDefinition({ name: 'Inválida', points: -1.5 }))
      .toThrow(/entero/)
    const original = event()
    expect(() => applyTournamentPenalty(
      original, original.participants[0].playerKey,
      { ...penalty(-1), active: false }, context(original), ids, now,
    )).toThrow(/disponible/)
  })

  it('detecta impacto mensual consolidado aunque el pozo de fecha sea cero', () => {
    const base = createDefaultLeaguePeriod(ids)
    const league = {
      ...base,
      contributionConfig: {
        contributionPerPlayer: 4000,
        dateContributionPerPlayer: 0,
        monthlyContributionPerPlayer: 4000,
      },
    }
    const original = event('league_auto', league)
    const closed = finishLeaguePeriod(ledger(league), league.id, [original], ids, now)
    expect(closed.creditMovements.some((movement) => movement.type === 'date_prize')).toBe(false)
    expect(closed.creditMovements.some((movement) => movement.type === 'month_prize')).toBe(true)
    const consolidatedMovements = JSON.stringify(closed.creditMovements)
    const penalized = applyTournamentPenalty(
      original, original.participants[0].playerKey, penalty(-4),
      context(original, closed, closed.leaguePeriods[0]), ids, now,
    )
    expect(penalized.financialReviewRequired).toBe(true)
    expect(JSON.stringify(closed.creditMovements)).toBe(consolidatedMovements)
  })

  it('una unificación de identidades conserva la penalización con el playerKey vigente', () => {
    const first = importParticipants(createTournament({
      name: 'Fecha 1', date: '2026-09-20', totalRounds: 1,
      rotating1: 'Uno', rotating2: 'Dos', rotating3: 'Tres',
      type: 'independent', prizeMode: 'none', prizePool: 0,
      percentagesByPosition: [100],
    }, ids), 'Jugador A', ids).tournament
    const second = importParticipants(createTournament({
      name: 'Fecha 2', date: '2026-09-22', totalRounds: 1,
      rotating1: 'Uno', rotating2: 'Dos', rotating3: 'Tres',
      type: 'independent', prizeMode: 'none', prizePool: 0,
      percentagesByPosition: [100],
    }, ids), 'Jugador A alias', ids).tournament
    const sourceKey = second.participants[0].playerKey
    const targetKey = first.participants[0].playerKey
    const penalized = applyTournamentPenalty(second, sourceKey, penalty(-2), context(second), ids, now)
    const tournaments = [first, penalized]
    const merged = mergePlayerIdentities(
      tournaments, ledger(), buildPlayerRegistry(tournaments, [], now),
      sourceKey, targetKey, 'Jugador A', now,
    )
    expect(merged.tournaments[1].penaltyMovements[0].playerKey).toBe(targetKey)
    expect(merged.tournaments[1].participants[0].playerKey).toBe(targetKey)
    expect(calculateTournamentStanding(merged.tournaments[1])[0].penaltyPoints).toBe(-2)
  })
})
