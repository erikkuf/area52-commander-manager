import { describe, expect, it } from 'vitest'
import { buildLeagueLeaderboard } from './league'
import { importParticipants } from './participants'
import { calculateLeaguePoolSummary, createDefaultLeaguePeriod, upsertLeaguePoolContribution } from './prizes'
import { saveTableResults } from './results'
import { finalizeTournament, finishRound } from './rounds'
import { confirmRoundTables } from './tables'
import { createTournament, startTournament } from './tournamentOperations'
import { assessTournamentDeletion, deleteSetupTournament } from './tournamentDeletion'
import { createEmptyWorkspace } from './workspace'
import type { LeaguePeriod, LeaguePrizeLedger, Tournament } from './tournament'
import { deserializeAppState, serializeAppState } from '../services/localStorageAppStateRepository'

let sequence = 0
const ids = (prefix: string) => `${prefix}-${++sequence}`
function setup(league?: LeaguePeriod) {
  return importParticipants(createTournament({
    name: 'Evento de prueba', date: '2026-09-29', totalRounds: 1,
    rotating1: 'Uno', rotating2: 'Dos', rotating3: 'Tres',
    type: league ? 'league_date' : 'independent',
    prizeMode: league ? 'league_auto' : 'none', leaguePeriodId: league?.id,
    prizePool: 0, percentagesByPosition: [50, 30, 20],
  }, ids, league), 'Jugador A\nJugador B\nJugador C', ids).tournament
}
function state(event: Tournament, league?: LeaguePeriod) {
  const workspace = { ...createEmptyWorkspace(), tournaments: [event] }
  const ledger: LeaguePrizeLedger = {
    leaguePeriods: league ? [league] : [], contributions: [], creditMovements: [],
    specialPointMovements: [], championSnapshots: [],
  }
  return { workspace, ledger }
}
describe('eliminar únicamente preparación de eventos', () => {
  it.each(['league_date', 'independent'])('permite eliminar %s en setup sin rondas', (type) => {
    const league = type === 'league_date' ? createDefaultLeaguePeriod(ids) : undefined
    const event = setup(league)
    const original = state(event, league)
    const next = deleteSetupTournament(original.workspace, original.ledger, event.id)
    expect(next.workspace.tournaments).toEqual([])
    expect(original.workspace.tournaments).toEqual([event])
  })
  it('bloquea la primera ronda generada aun sin resultados confirmados', () => {
    const started = startTournament(setup(), () => 0.5, ids)
    const inconsistent = { ...started, status: 'setup' as const, currentRound: 0 }
    const original = state(inconsistent)
    expect(() => deleteSetupTournament(original.workspace, original.ledger, inconsistent.id)).toThrow(/emparejamientos/)
  })
  it('bloquea resultados y eventos finished aunque la UI intentara borrar', () => {
    let event = startTournament(setup(), () => 0.5, ids)
    event = confirmRoundTables(event, event.rounds[0].id)
    event = saveTableResults(event, event.rounds[0].id, event.rounds[0].tables[0].id)
    expect(assessTournamentDeletion({ ...event, status: 'setup' }, state(event).ledger).allowed).toBe(false)
    const finished = { ...setup(), status: 'finished' as const }
    const original = state(finished)
    expect(() => deleteSetupTournament(original.workspace, original.ledger, finished.id)).toThrow(/preparación/)
  })
  it.each(['active', 'void'] as const)('un movimiento financiero %s asociado bloquea eliminación y no se borra', (status) => {
    const event = setup()
    const original = state(event)
    original.ledger.creditMovements.push({
      id: 'credit', tournamentId: event.id, playerKey: 'player-a', type: 'date_prize',
      amount: 1000, reason: 'Histórico', createdAt: event.createdAt, status,
    })
    expect(() => deleteSetupTournament(original.workspace, original.ledger, event.id)).toThrow(/financieros/)
    expect(original.ledger.creditMovements).toHaveLength(1)
  })
  it('bloquea aportes consolidados, incluso con estado preparatorio inconsistente', () => {
    const league = createDefaultLeaguePeriod(ids)
    const event = setup(league)
    const original = state(event, league)
    const ledger = upsertLeaguePoolContribution(original.ledger, event, league, ids)
    ledger.contributions[0] = { ...ledger.contributions[0], status: 'finalized' }
    expect(() => deleteSetupTournament(original.workspace, ledger, event.id)).toThrow(/consolidados/)
  })
  it('bloquea historial de penalizaciones, incluso anuladas', () => {
    const event = setup()
    event.penaltyMovements = [{ id: 'penalty', tournamentId: event.id,
      playerKey: event.participants[0].playerKey, name: 'Falta', amount: -1,
      createdAt: event.createdAt, status: 'void' }]
    expect(assessTournamentDeletion(event, state(event).ledger).allowed).toBe(false)
  })
  it('quita la asociación y proyección de la fecha; conserva otras fechas, Leaderboard y crédito', () => {
    const league = createDefaultLeaguePeriod(ids)
    const event = setup(league)
    let history = startTournament(setup(league), () => 0.5, ids)
    history = confirmRoundTables(history, history.rounds[0].id)
    history = saveTableResults(history, history.rounds[0].id, history.rounds[0].tables[0].id)
    history = finalizeTournament(finishRound(history, history.rounds[0].id), undefined,
      history.participants.map((participant) => participant.id))
    const original = state(event, league)
    original.workspace.tournaments.push(history)
    original.workspace.navigation.openedTournamentId = event.id
    let ledger = upsertLeaguePoolContribution(original.ledger, event, league, ids)
    ledger = upsertLeaguePoolContribution(ledger, history, league, ids)
    ledger.creditMovements = [{ id: 'historic-credit', playerKey: history.participants[0].playerKey,
      tournamentId: history.id, type: 'date_prize', amount: 3000, reason: 'Histórico',
      createdAt: history.createdAt, status: 'active' }]
    const before = buildLeagueLeaderboard([history], league, ledger)
    const next = deleteSetupTournament(original.workspace, ledger, event.id)
    expect(next.workspace.tournaments.filter((item) => item.leaguePeriodId === league.id)).toEqual([history])
    expect(next.workspace.tournaments[0]).toBe(history)
    expect(next.ledger.leaguePeriods).toBe(ledger.leaguePeriods)
    expect(next.ledger.creditMovements).toBe(ledger.creditMovements)
    expect(next.ledger.contributions.map((item) => item.tournamentId)).toEqual([history.id])
    expect(calculateLeaguePoolSummary(next.ledger.contributions, league.id).monthlyProjectedPool).toBe(6000)
    const competitive = (entries: ReturnType<typeof buildLeagueLeaderboard>) => entries.map(({ monthlyPrize: _monthly, totalCredit: _total, ...entry }) => entry)
    expect(competitive(buildLeagueLeaderboard(next.workspace.tournaments, league, next.ledger))).toEqual(competitive(before))
    // Solo cambia la proyección; los puntos/posiciones y créditos históricos quedan intactos.
    expect(before[0].monthlyPrize).toBe(6000)
    expect(buildLeagueLeaderboard(next.workspace.tournaments, league, next.ledger)[0].monthlyPrize).toBe(3000)
    expect(next.workspace.navigation).toMatchObject({ globalSection: 'leagues', selectedLeaguePeriodId: league.id, openedTournamentId: undefined })
    const restored = deserializeAppState(serializeAppState(next))!
    expect(restored.workspace.tournaments.map((item) => item.id)).toEqual([history.id])
    expect(restored.ledger.creditMovements).toEqual(ledger.creditMovements)
    expect(restored.ledger.contributions).toEqual(next.ledger.contributions)
  })
})
