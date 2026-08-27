import { describe, expect, it } from 'vitest'
import {
  markTournamentFinancialReviewRequired,
  previewTableCorrection,
  recalculateTournamentStanding,
  resolveTournamentFinancialReview,
} from './competitive'
import { calculateAvailableCredit, registerCreditUsage } from './credits'
import { calculateTournamentStanding } from './leaderboard'
import {
  applyDateCreditCorrections,
  buildLeagueDateCreditCorrections,
  buildLeagueLeaderboard,
  consolidateTournamentPrizes,
  finishLeaguePeriod,
  markLeagueReviewRequired,
  refreshLeagueFinancialReviewRequirements,
  reopenLeaguePeriod,
  resolveLeagueFinancialReview,
  synchronizeFinishedTournamentPrizes,
} from './league'
import { importParticipants } from './participants'
import { createDefaultLeaguePeriod, upsertLeaguePoolContribution } from './prizes'
import {
  beginRoundCorrection,
  beginTableCorrection,
  isSurvivalControlDisabled,
  isWinnerControlDisabled,
  saveTableResults,
  updatePlayerResult,
  validateTableResults,
} from './results'
import { finalizeTournament, finishRound, generateNextRound } from './rounds'
import { registerSpecialPointMovement } from './specialPoints'
import { confirmRoundTables } from './tables'
import { createTournament, startTournament } from './tournamentOperations'
import type { IdFactory, LeaguePeriod, LeaguePrizeLedger, Tournament } from './tournament'

function ids(scope: string): IdFactory {
  let value = 0
  return (prefix) => `${scope}-${prefix}-${++value}`
}

function setupEvent(
  name: string,
  totalRounds = 1,
  league?: LeaguePeriod,
): Tournament {
  return importParticipants(
    createTournament(
      {
        name,
        date: '2026-08-18',
        totalRounds,
        rotating1: 'R1',
        rotating2: 'R2',
        rotating3: 'R3',
        type: league ? 'league_date' : 'independent',
        prizeMode: league ? 'league_auto' : 'manual_credit',
        leaguePeriodId: league?.id,
        prizePool: league ? 0 : 30000,
        percentagesByPosition: [50, 30, 20],
      },
      ids(`${name}-tournament`),
      league,
    ),
    'Ana\nBeto\nCarla',
    ids(`${name}-players`),
  ).tournament
}

function activeRound(tournament: Tournament): Tournament {
  const started = startTournament(tournament, () => 0.5, ids(`${tournament.name}-round`))
  return confirmRoundTables(started, started.rounds[0].id)
}

function saveRoundWithWinner(tournament: Tournament, winnerIndex = 0): Tournament {
  const round = tournament.rounds.find((item) => item.number === tournament.currentRound)!
  const table = round.tables[0]
  const winnerId = table.participantIds[winnerIndex]
  const withWinner = updatePlayerResult(tournament, round.id, table.id, winnerId, {
    wonTable: true,
  })
  return round.tables.reduce(
    (current, currentTable) => saveTableResults(current, round.id, currentTable.id),
    withWinner,
  )
}

function finishedEvent(name: string, league?: LeaguePeriod, winnerIndex = 0): Tournament {
  const saved = saveRoundWithWinner(activeRound(setupEvent(name, 1, league)), winnerIndex)
  return finalizeTournament(finishRound(saved, saved.rounds[0].id))
}

describe('Standing y Leaderboard', () => {
  it('el Standing usa únicamente resultados del Tournament actual', () => {
    const first = finishedEvent('Primero', undefined, 0)
    const second = finishedEvent('Segundo', undefined, 1)
    expect(calculateTournamentStanding(first)[0].participantId).toBe(
      first.rounds[0].tables[0].results.find((result) => result.wonTable)?.participantId,
    )
    expect(calculateTournamentStanding(second)[0].participantId).toBe(
      second.rounds[0].tables[0].results.find((result) => result.wonTable)?.participantId,
    )
  })

  it('el Leaderboard agrega las fechas de su LeaguePeriod', () => {
    const league = { ...createDefaultLeaguePeriod(ids('league')), id: 'league-aggregate' }
    const first = finishedEvent('Fecha A', league, 0)
    const second = finishedEvent('Fecha B', league, 0)
    const ledger: LeaguePrizeLedger = { leaguePeriods: [league], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [] }
    expect(buildLeagueLeaderboard([first, second], league, ledger)[0]).toMatchObject({ playerName: 'Ana', leaguePoints: 6, participations: 2 })
  })

  it('puntos especiales no afectan Standing y sí afectan Leaderboard', () => {
    const league = { ...createDefaultLeaguePeriod(ids('league')), id: 'league-special' }
    const tournament = finishedEvent('Fecha especial', league, 0)
    const ana = tournament.participants[0]
    const beforeStanding = calculateTournamentStanding(tournament)
    const ledger: LeaguePrizeLedger = {
      leaguePeriods: [league],
      contributions: [],
      creditMovements: [],
      specialPointMovements: registerSpecialPointMovement([], league.id, ana.playerKey, 2),
      championSnapshots: [],
    }
    expect(calculateTournamentStanding(tournament)).toEqual(beforeStanding)
    expect(buildLeagueLeaderboard([tournament], league, ledger).find((entry) => entry.playerKey === ana.playerKey)).toMatchObject({ specialLeaguePoints: 2, leaguePoints: 5 })
  })

  it('desempata por victorias de mesa antes que por nombre', () => {
    const tournament = activeRound(setupEvent('Desempate victorias'))
    const round = tournament.rounds[0]
    const table = round.tables[0]
    const [winnerId, achievementId] = table.participantIds
    let updated = updatePlayerResult(tournament, round.id, table.id, winnerId, { wonTable: true })
    updated = updatePlayerResult(updated, round.id, table.id, achievementId, {
      rotating1: true,
      rotating2: true,
      rotating3: true,
    })
    const saved = saveTableResults(updated, round.id, table.id)
    expect(calculateTournamentStanding(saved).map((entry) => entry.participantId).slice(0, 2)).toEqual([
      winnerId,
      achievementId,
    ])
  })

  it('desempata por eliminaciones cuando victorias y logros siguen iguales', () => {
    const tournament = activeRound(setupEvent('Desempate eliminaciones'))
    const round = tournament.rounds[0]
    const table = round.tables[0]
    const [eliminatorId, achievementId] = table.participantIds
    let updated = updatePlayerResult(tournament, round.id, table.id, eliminatorId, {
      rotating1: true,
      eliminations: 2,
    })
    updated = updatePlayerResult(updated, round.id, table.id, achievementId, {
      rotating1: true,
      rotating2: true,
      rotating3: true,
    })
    const saved = saveTableResults(updated, round.id, table.id)
    expect(calculateTournamentStanding(saved).map((entry) => entry.participantId).slice(0, 2)).toEqual([
      eliminatorId,
      achievementId,
    ])
  })

  it('un snapshot oficial conserva un desempate administrativo de una liga finalizada', () => {
    const league = { ...createDefaultLeaguePeriod(ids('official-order')), id: 'league-official' }
    const tournament = finishedEvent('Orden oficial', league)
    const ledger: LeaguePrizeLedger = {
      leaguePeriods: [league], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [],
    }
    const natural = buildLeagueLeaderboard([tournament], league, ledger)
    const reversedKeys = natural.map((entry) => entry.playerKey).reverse()
    const finishedLeague = {
      ...league,
      status: 'finished' as const,
      finalizedLeaderboardPlayerKeys: reversedKeys,
    }
    const official = buildLeagueLeaderboard([tournament], finishedLeague, {
      ...ledger,
      leaguePeriods: [finishedLeague],
    })
    expect(official.map((entry) => entry.playerKey)).toEqual(reversedKeys)
  })
})

describe('ganador único y Sobrevivir', () => {
  it('una mesa admite máximo un ganador', () => {
    const active = activeRound(setupEvent('Ganadores'))
    const table = active.rounds[0].tables[0]
    const invalid = {
      ...table,
      results: table.results.map((result, index) => ({ ...result, wonTable: index < 2 })),
    }
    expect(() => validateTableResults(invalid, active.participants)).toThrow(/Solo un jugador/)
  })

  it('al seleccionar ganador bloquea Ganar y Sobrevivir de los demás', () => {
    const active = activeRound(setupEvent('Bloqueos'))
    const table = active.rounds[0].tables[0]
    const winnerId = table.participantIds[0]
    const otherId = table.participantIds[1]
    const withWinner = updatePlayerResult(active, active.rounds[0].id, table.id, winnerId, { wonTable: true })
    const updatedTable = withWinner.rounds[0].tables[0]
    expect(isWinnerControlDisabled(updatedTable, otherId)).toBe(true)
    expect(isSurvivalControlDisabled(updatedTable, otherId)).toBe(true)
    expect(isWinnerControlDisabled(updatedTable, winnerId)).toBe(false)
  })

  it('no permite elegir otro ganador hasta desmarcar al actual', () => {
    const active = activeRound(setupEvent('Cambio ganador'))
    const table = active.rounds[0].tables[0]
    const first = table.participantIds[0]
    const second = table.participantIds[1]
    const withWinner = updatePlayerResult(active, active.rounds[0].id, table.id, first, { wonTable: true })
    expect(() => updatePlayerResult(withWinner, active.rounds[0].id, table.id, second, { wonTable: true })).toThrow(/Desmarca/)
    const withoutWinner = updatePlayerResult(withWinner, active.rounds[0].id, table.id, first, { wonTable: false })
    expect(() => updatePlayerResult(withoutWinner, active.rounds[0].id, table.id, second, { wonTable: true })).not.toThrow()
  })

  it('marcar ganador fuerza survived=false en el resto y desmarcar no lo restaura', () => {
    const active = activeRound(setupEvent('Sobrevivientes'))
    const table = active.rounds[0].tables[0]
    const winnerId = table.participantIds[0]
    const otherId = table.participantIds[1]
    const withSurvivor = updatePlayerResult(active, active.rounds[0].id, table.id, otherId, { survived: true })
    const withWinner = updatePlayerResult(withSurvivor, active.rounds[0].id, table.id, winnerId, { wonTable: true })
    expect(withWinner.rounds[0].tables[0].results.find((result) => result.participantId === otherId)?.survived).toBe(false)
    const unmarked = updatePlayerResult(withWinner, active.rounds[0].id, table.id, winnerId, { wonTable: false })
    expect(unmarked.rounds[0].tables[0].results.find((result) => result.participantId === otherId)?.survived).toBe(false)
    expect(isSurvivalControlDisabled(unmarked.rounds[0].tables[0], otherId)).toBe(false)
  })

  it('valida que ningún no-ganador sobreviva mientras existe ganador', () => {
    const active = activeRound(setupEvent('Validación sobrevivir'))
    const table = active.rounds[0].tables[0]
    const invalid = {
      ...table,
      results: table.results.map((result, index) => ({ ...result, wonTable: index === 0, survived: index === 1 })),
    }
    expect(() => validateTableResults(invalid, active.participants)).toThrow(/sobrevivientes/)
  })
})

describe('finalización y rondas históricas', () => {
  it('la última ronda finalizada pasa a rounds_completed, no a finished', () => {
    const saved = saveRoundWithWinner(activeRound(setupEvent('Cierre explícito')))
    const completed = finishRound(saved, saved.rounds[0].id)
    expect(completed.status).toBe('rounds_completed')
    expect(completed.finishedAt).toBeUndefined()
  })

  it('Finalizar Evento cambia a finished y registra finishedAt', () => {
    const saved = saveRoundWithWinner(activeRound(setupEvent('Finalizado')))
    const completed = finishRound(saved, saved.rounds[0].id)
    const finished = finalizeTournament(completed, '2026-08-18T20:00:00.000Z')
    expect(finished).toMatchObject({ status: 'finished', finishedAt: '2026-08-18T20:00:00.000Z' })
  })

  it('conserva rondas anteriores accesibles al generar la siguiente', () => {
    const firstActive = activeRound(setupEvent('Dos rondas', 2))
    const firstFinished = finishRound(saveRoundWithWinner(firstActive), firstActive.rounds[0].id)
    const next = generateNextRound(firstFinished, () => 0.5, ids('next'))
    expect(next.rounds).toHaveLength(2)
    expect(next.rounds[0].status).toBe('finished')
    expect(next.currentRound).toBe(2)
  })

  it('una ronda finalizada requiere confirmación y permanece finalizada durante la corrección', () => {
    const event = finishedEvent('Corrección protegida')
    const round = event.rounds[0]
    expect(() => beginTableCorrection(event, round.id, round.tables[0].id)).toThrow(/Corregir ronda/)
    const correcting = beginTableCorrection(beginRoundCorrection(event, round.id), round.id, round.tables[0].id)
    expect(correcting.rounds[0]).toMatchObject({ status: 'finished', isCorrectionMode: true, wasEditedAfterFinish: true })
  })

  it('compara Standing anterior/nuevo y recalcula al guardar la corrección', () => {
    const event = finishedEvent('Comparación')
    const round = event.rounds[0]
    const table = round.tables[0]
    const oldWinner = table.results.find((result) => result.wonTable)!.participantId
    const newWinner = table.results.find((result) => result.participantId !== oldWinner)!.participantId
    let correcting = beginTableCorrection(beginRoundCorrection(event, round.id), round.id, table.id)
    correcting = updatePlayerResult(correcting, round.id, table.id, oldWinner, { wonTable: false })
    correcting = updatePlayerResult(correcting, round.id, table.id, newWinner, { wonTable: true })
    const preview = previewTableCorrection(correcting, round.id, table.id)
    expect(preview.changed).toBe(true)
    expect(preview.previous[0].participantId).toBe(oldWinner)
    expect(preview.next[0].participantId).toBe(newWinner)
    const saved = saveTableResults(correcting, round.id, table.id)
    expect(calculateTournamentStanding(saved)[0].participantId).toBe(newWinner)
  })

  it('recalcular reconstruye logros desde los hechos registrados', () => {
    const event = finishedEvent('Recalcular')
    const corrupted = {
      ...event,
      rounds: event.rounds.map((round) => ({ ...round, tables: round.tables.map((table) => ({ ...table, results: table.results.map((result) => ({ ...result, achievementPoints: 999 })), savedResults: table.savedResults.map((result) => ({ ...result, achievementPoints: 999 })) })) })),
    }
    expect(calculateTournamentStanding(recalculateTournamentStanding(corrupted))[0].achievementPoints).toBe(3)
  })
})

describe('reapertura y revisión financiera', () => {
  function closedLeague() {
    const league = { ...createDefaultLeaguePeriod(ids('league')), id: 'league-close' }
    const tournament = finishedEvent('Fecha cerrada', league)
    let ledger: LeaguePrizeLedger = { leaguePeriods: [league], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [] }
    ledger = upsertLeaguePoolContribution(ledger, tournament, league, ids('contribution'))
    ledger = consolidateTournamentPrizes(ledger, tournament, league, ids('date-prizes'))
    ledger = finishLeaguePeriod(ledger, league.id, [tournament], ids('month-prizes'))
    return { tournament, ledger, league: ledger.leaguePeriods[0] }
  }

  it('reabre una liga finished sin borrar fechas, snapshots ni créditos', () => {
    const { tournament, ledger, league } = closedLeague()
    const creditBefore = ledger.creditMovements
    const reopened = reopenLeaguePeriod(ledger, league.id, '2026-09-01T10:00:00.000Z')
    expect(reopened.leaguePeriods[0]).toMatchObject({ status: 'active', wasReopened: true, reopenedAt: '2026-09-01T10:00:00.000Z' })
    expect(reopened.leaguePeriods[0].finishedAt).toBe(league.finishedAt)
    expect(reopened.leaguePeriods[0].finalizedMonthlyAwards).toEqual(league.finalizedMonthlyAwards)
    expect(reopened.creditMovements).toEqual(creditBefore)
    expect(tournament.rounds).toHaveLength(1)
  })

  it('puntos especiales en liga reabierta recalculan Leaderboard y activan revisión', () => {
    const { tournament, ledger, league } = closedLeague()
    const reopened = reopenLeaguePeriod(ledger, league.id)
    const player = tournament.participants[1]
    const withPoints = {
      ...reopened,
      specialPointMovements: registerSpecialPointMovement(reopened.specialPointMovements, league.id, player.playerKey, 5),
    }
    const marked = markLeagueReviewRequired(withPoints, league.id)
    expect(buildLeagueLeaderboard([tournament], marked.leaguePeriods[0], marked)[0].playerKey).toBe(player.playerKey)
    expect(marked.leaguePeriods[0].financialReviewRequired).toBe(true)
  })

  it('volver a finalizar no duplica month_prize', () => {
    const { tournament, ledger, league } = closedLeague()
    const reopened = reopenLeaguePeriod(ledger, league.id)
    const refinalized = finishLeaguePeriod(reopened, league.id, [tournament], ids('refinish'))
    expect(refinalized.creditMovements.filter((movement) => movement.type === 'month_prize')).toHaveLength(
      ledger.creditMovements.filter((movement) => movement.type === 'month_prize').length,
    )
  })

  it('una corrección deportiva no modifica CreditMovement', () => {
    const { tournament, ledger } = closedLeague()
    const markedTournament = markTournamentFinancialReviewRequired(tournament)
    expect(markedTournament.financialReviewRequired).toBe(true)
    expect(ledger.creditMovements).toEqual(ledger.creditMovements)
  })

  it('financialReviewRequired solo desaparece mediante resolución explícita', () => {
    const { ledger, league } = closedLeague()
    const markedLedger = markLeagueReviewRequired(ledger, league.id)
    expect(reopenLeaguePeriod(markedLedger, league.id).leaguePeriods[0].financialReviewRequired).toBe(true)
    expect(resolveLeagueFinancialReview(markedLedger, league.id).leaguePeriods[0].financialReviewRequired).toBe(false)
    const tournament = markTournamentFinancialReviewRequired(finishedEvent('Resolver'))
    expect(resolveTournamentFinancialReview(tournament).financialReviewRequired).toBe(false)
  })

  it('restaura premios de fechas finalizadas omitidos sin duplicarlos', () => {
    const league = { ...createDefaultLeaguePeriod(ids('missing-prize')), id: 'league-missing-prize' }
    const tournament = finishedEvent('Fecha sin ledger', league)
    let ledger: LeaguePrizeLedger = {
      leaguePeriods: [league],
      contributions: [],
      creditMovements: [],
      specialPointMovements: [],
      championSnapshots: [],
    }
    ledger = synchronizeFinishedTournamentPrizes(ledger, [tournament])
    const once = ledger.creditMovements.filter((movement) => movement.type === 'date_prize')
    ledger = synchronizeFinishedTournamentPrizes(ledger, [tournament])
    expect(once).toHaveLength(3)
    expect(ledger.creditMovements.filter((movement) => movement.type === 'date_prize')).toHaveLength(3)
  })

  it('consolida el crédito de fecha y permite usarlo antes de finalizar la liga', () => {
    const league = { ...createDefaultLeaguePeriod(ids('available-date-credit')), id: 'league-active-credit' }
    const tournament = finishedEvent('Fecha con crédito inmediato', league)
    let ledger: LeaguePrizeLedger = upsertLeaguePoolContribution(
      { leaguePeriods: [league], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [] },
      tournament,
      league,
      ids('available-contribution'),
    )

    expect(buildLeagueLeaderboard([tournament], league, ledger)[0].dateCreditEarned).toBe(0)
    ledger = synchronizeFinishedTournamentPrizes(ledger, [tournament])
    const entry = buildLeagueLeaderboard([tournament], league, ledger)[0]

    expect(league.status).toBe('active')
    expect(entry).toMatchObject({
      dateCreditEarned: 3000,
      monthlyPrize: 3000,
      monthlyPrizeStatus: 'projected',
      totalCredit: 6000,
      totalCreditStatus: 'projected',
    })
    const withUsage = registerCreditUsage(
      ledger.creditMovements,
      entry.playerKey,
      1000,
      'Uso antes del cierre mensual',
      ids('early-usage'),
    )
    expect(calculateAvailableCredit(withUsage, entry.playerKey)).toBe(2000)
  })

  it('mantiene separados el crédito de fechas, el mensual final y el total final', () => {
    const league = { ...createDefaultLeaguePeriod(ids('final-credit-total')), id: 'league-final-credit' }
    const tournament = finishedEvent('Fecha total final', league)
    const initial: LeaguePrizeLedger = upsertLeaguePoolContribution(
      { leaguePeriods: [league], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [] },
      tournament,
      league,
      ids('final-contribution'),
    )
    const finished = finishLeaguePeriod(
      initial,
      league.id,
      [tournament],
      ids('final-credit-movements'),
    )
    const finalLeague = finished.leaguePeriods[0]
    const entry = buildLeagueLeaderboard([tournament], finalLeague, finished)[0]

    expect(entry).toMatchObject({
      dateCreditEarned: 3000,
      monthlyPrize: 3000,
      monthlyPrizeStatus: 'final',
      totalCredit: 6000,
      totalCreditStatus: 'final',
    })
  })

  it('no reasigna automáticamente créditos consolidados después de una corrección', () => {
    const league = { ...createDefaultLeaguePeriod(ids('immutable-credit')), id: 'league-immutable-credit' }
    const tournament = finishedEvent('Fecha corregida', league)
    const initial: LeaguePrizeLedger = synchronizeFinishedTournamentPrizes(
      { leaguePeriods: [league], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [] },
      [tournament],
    )
    const corrected = markTournamentFinancialReviewRequired({
      ...tournament,
      rounds: tournament.rounds.map((round) => ({
        ...round,
        tables: round.tables.map((table) => ({
          ...table,
          results: table.results.map((result, index) => ({
            ...result,
            achievementPoints: index === 2 ? 99 : result.achievementPoints,
          })),
          savedResults: table.savedResults.map((result, index) => ({
            ...result,
            achievementPoints: index === 2 ? 99 : result.achievementPoints,
          })),
        })),
      })),
    })
    const synchronized = synchronizeFinishedTournamentPrizes(initial, [corrected])
    expect(synchronized.creditMovements).toEqual(initial.creditMovements)
  })

  it('corrige aumentos y descuentos de todos los jugadores sin duplicar movimientos', () => {
    const league = { ...createDefaultLeaguePeriod(ids('date-compensation')), id: 'league-date-compensation' }
    const tournament = finishedEvent('Fecha compensada', league)
    const initial = synchronizeFinishedTournamentPrizes(
      { leaguePeriods: [league], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [] },
      [tournament],
    )
    const originalWinnerId = tournament.rounds[0].tables[0].savedResults.find(
      (result) => result.wonTable,
    )!.participantId
    const newWinnerPlayerKey = initial.creditMovements.find(
      (movement) => movement.type === 'date_prize' && movement.amount === 1800,
    )!.playerKey
    const newWinnerId = tournament.participants.find(
      (participant) => participant.playerKey === newWinnerPlayerKey,
    )!.id
    const corrected = markTournamentFinancialReviewRequired({
      ...tournament,
      rounds: tournament.rounds.map((round) => ({
        ...round,
        tables: round.tables.map((table) => ({
          ...table,
          results: table.results.map((result) => ({
            ...result,
            wonTable: result.participantId === newWinnerId,
            achievementPoints: result.participantId === newWinnerId ? 3 : 0,
          })),
          savedResults: table.savedResults.map((result) => ({
            ...result,
            wonTable: result.participantId === newWinnerId,
            achievementPoints: result.participantId === newWinnerId ? 3 : 0,
          })),
        })),
      })),
    })
    const corrections = buildLeagueDateCreditCorrections([corrected], league, initial)
    expect(corrections).toHaveLength(2)
    expect(corrections.find((correction) => correction.direction === 'positive')).toMatchObject({
      playerName: corrected.participants.find((participant) => participant.id === newWinnerId)?.name,
      consolidated: 1800,
      theoretical: 3000,
      difference: 1200,
      amount: 1200,
    })
    expect(corrections.find((correction) => correction.direction === 'negative')).toMatchObject({
      playerName: corrected.participants.find((participant) => participant.id === originalWinnerId)?.name,
      consolidated: 3000,
      theoretical: 1800,
      difference: -1200,
      amount: 1200,
    })

    const adjusted = applyDateCreditCorrections(
      initial,
      [corrected],
      league,
      ids('date-compensation-movement'),
      '2026-08-19T20:00:00.000Z',
    )
    const repeated = applyDateCreditCorrections(
      adjusted,
      [corrected],
      league,
      ids('date-compensation-repeat'),
      '2026-08-19T21:00:00.000Z',
    )
    const compensationMovement = adjusted.creditMovements.find(
      (movement) => movement.type === 'positive_adjustment',
    )
    expect(compensationMovement).toMatchObject({
      tournamentId: corrected.id,
      leaguePeriodId: league.id,
      amount: 1200,
      sourceReference: expect.stringContaining('date-credit-correction:'),
    })
    expect(adjusted.creditMovements.find(
      (movement) => movement.type === 'negative_adjustment',
    )).toMatchObject({
      tournamentId: corrected.id,
      leaguePeriodId: league.id,
      amount: 1200,
      sourceReference: expect.stringContaining('date-credit-correction:'),
    })
    expect(repeated).toEqual(adjusted)

    const leaderboard = buildLeagueLeaderboard([corrected], league, adjusted)
    const correctedWinner = leaderboard.find((entry) =>
      entry.playerKey === corrected.participants.find((participant) => participant.id === newWinnerId)?.playerKey,
    )!
    const correctedFormerWinner = leaderboard.find((entry) =>
      entry.playerKey === corrected.participants.find((participant) => participant.id === originalWinnerId)?.playerKey,
    )!
    expect(correctedWinner).toMatchObject({
      dateCreditEarned: 3000,
      theoreticalDateCredit: 3000,
      dateCreditDifference: 0,
    })
    expect(correctedFormerWinner).toMatchObject({
      dateCreditEarned: 1800,
      theoreticalDateCredit: 1800,
      dateCreditDifference: 0,
    })
    expect(calculateAvailableCredit(adjusted.creditMovements, correctedWinner.playerKey)).toBe(3000)
    expect(calculateAvailableCredit(adjusted.creditMovements, correctedFormerWinner.playerKey)).toBe(1800)

    const withPriorUsage: LeaguePrizeLedger = {
      ...initial,
      creditMovements: registerCreditUsage(
        initial.creditMovements,
        correctedFormerWinner.playerKey,
        2500,
        'Crédito utilizado antes de detectar el error',
        ids('prior-usage'),
      ),
    }
    const correctedAfterUsage = applyDateCreditCorrections(
      withPriorUsage,
      [corrected],
      league,
      ids('correction-after-usage'),
    )
    expect(calculateAvailableCredit(
      correctedAfterUsage.creditMovements,
      correctedFormerWinner.playerKey,
    )).toBe(-700)
  })

  it('reactiva revisión si un impacto deportivo es posterior a su resolución', () => {
    const { tournament, ledger, league } = closedLeague()
    const resolved = resolveLeagueFinancialReview(
      markLeagueReviewRequired(ledger, league.id, '2026-09-01T10:00:00.000Z'),
      league.id,
      '2026-09-01T10:05:00.000Z',
    )
    const withLatePoint = {
      ...resolved,
      specialPointMovements: registerSpecialPointMovement(
        resolved.specialPointMovements,
        league.id,
        tournament.participants[0].playerKey,
        1,
        'Corrección tardía',
        ids('late-special'),
        '2026-09-01T10:10:00.000Z',
      ),
    }
    const refreshed = refreshLeagueFinancialReviewRequirements(withLatePoint, [tournament])
    expect(refreshed.leaguePeriods[0]).toMatchObject({
      financialReviewRequired: true,
      financialReviewResolvedAt: undefined,
      financialReviewLastImpactAt: '2026-09-01T10:10:00.000Z',
    })
  })
})
