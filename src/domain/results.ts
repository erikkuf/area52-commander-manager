import {
  achievementPointConfigFromTournament,
  calculateAchievementPoints,
} from './achievements'
import { DomainError } from './errors'
import type { CommanderTable, Participant, PlayerResult, Round, Tournament } from './tournament'

export type PlayerResultChanges = Partial<
  Pick<
    PlayerResult,
    | 'rotating1'
    | 'rotating2'
    | 'rotating3'
    | 'rotating4'
    | 'rotating5'
    | 'wonTable'
    | 'eliminations'
    | 'survived'
  >
>

export function isWinnerControlDisabled(
  table: CommanderTable,
  participantId: string,
): boolean {
  return table.results.some(
    (result) => result.participantId !== participantId && result.wonTable,
  )
}

export function isSurvivalControlDisabled(
  table: CommanderTable,
  participantId: string,
): boolean {
  return isWinnerControlDisabled(table, participantId)
}

function findRoundAndTable(tournament: Tournament, roundId: string, tableId: string) {
  const round = tournament.rounds.find((item) => item.id === roundId)
  if (!round) throw new DomainError('No se encontró la ronda.')
  const table = round.tables.find((item) => item.id === tableId)
  if (!table) throw new DomainError('No se encontró la mesa.')
  return { round, table }
}

function replaceTable(
  tournament: Tournament,
  roundId: string,
  tableId: string,
  update: (table: CommanderTable) => CommanderTable,
  roundUpdate?: (round: Round) => Round,
): Tournament {
  return {
    ...tournament,
    rounds: tournament.rounds.map((round) => {
      if (round.id !== roundId) return round
      const updatedRound = {
        ...round,
        tables: round.tables.map((table) => (table.id === tableId ? update(table) : table)),
      }
      return roundUpdate ? roundUpdate(updatedRound) : updatedRound
    }),
    updatedAt: new Date().toISOString(),
  }
}

export function validateTableResults(table: CommanderTable, participants?: Participant[]): void {
  const participantsById = new Map(participants?.map((participant) => [participant.id, participant]))
  const competitiveParticipantIds = participants
    ? table.participantIds.filter((participantId) => !participantsById.get(participantId)?.isGhost)
    : table.participantIds
  const participantIds = new Set(competitiveParticipantIds)
  const maximumEliminations = Math.min(3, Math.max(0, table.participantIds.length - 1))
  const resultIds = table.results.map((result) => result.participantId)
  const resultIdSet = new Set(resultIds)

  if (resultIds.length !== competitiveParticipantIds.length) {
    throw new DomainError('Debe existir un resultado para cada jugador de la mesa.')
  }
  if (resultIdSet.size !== resultIds.length) {
    throw new DomainError('Un jugador no puede tener resultados duplicados en la mesa.')
  }
  if (
    resultIdSet.size !== participantIds.size ||
    resultIds.some((participantId) => !participantIds.has(participantId))
  ) {
    throw new DomainError('Los resultados deben pertenecer exactamente a los jugadores de la mesa.')
  }
  if (
    table.results.some(
      (result) =>
        !Number.isInteger(result.eliminations) ||
        result.eliminations < 0 ||
        result.eliminations > maximumEliminations,
    )
  ) {
    throw new DomainError('Las eliminaciones deben estar dentro del máximo de oponentes sentados en la mesa.')
  }
  if (table.results.filter((result) => result.wonTable).length > 1) {
    throw new DomainError('Solo un jugador puede figurar como ganador de la mesa.')
  }
  const winner = table.results.find((result) => result.wonTable)
  if (winner && table.results.some((result) => result.participantId !== winner.participantId && result.survived)) {
    throw new DomainError('Si existe un ganador, los demás jugadores no pueden figurar como sobrevivientes.')
  }
  if (
    participants &&
    table.results.some((result) => participantsById.get(result.participantId)?.isGhost)
  ) {
    throw new DomainError('El Jugador Fantasma no puede tener resultados competitivos.')
  }
}

export function updatePlayerResult(
  tournament: Tournament,
  roundId: string,
  tableId: string,
  participantId: string,
  changes: PlayerResultChanges,
): Tournament {
  const { round, table } = findRoundAndTable(tournament, roundId, tableId)
  if (round.status !== 'active' && !(round.status === 'finished' && round.isCorrectionMode)) {
    throw new DomainError('La ronda debe estar activa para registrar resultados.')
  }
  if (table.status === 'saved') {
    throw new DomainError('Usa “Editar resultados” antes de corregir una mesa guardada.')
  }
  if (!table.participantIds.includes(participantId)) {
    throw new DomainError('El jugador no pertenece a esta mesa.')
  }
  const participant = tournament.participants.find((item) => item.id === participantId)
  if (!participant || participant.isGhost) {
    throw new DomainError('El Jugador Fantasma no puede registrar resultados.')
  }
  if (
    changes.eliminations !== undefined &&
    (
      !Number.isInteger(changes.eliminations) ||
      changes.eliminations < 0 ||
      changes.eliminations > Math.min(3, Math.max(0, table.participantIds.length - 1))
    )
  ) {
    throw new DomainError('Las eliminaciones superan la cantidad de oponentes sentados en la mesa.')
  }

  const otherWinner = table.results.find(
    (result) => result.participantId !== participantId && result.wonTable,
  )
  if (changes.wonTable === true && otherWinner) {
    throw new DomainError('Desmarca al ganador actual antes de seleccionar uno diferente.')
  }
  if (changes.survived === true && otherWinner) {
    throw new DomainError('Con un ganador definido, los demás jugadores no pueden sobrevivir.')
  }

  const config = achievementPointConfigFromTournament(tournament)
  return replaceTable(tournament, roundId, tableId, (currentTable) => ({
    ...currentTable,
    results: currentTable.results.map((result) => {
      const isEditedPlayer = result.participantId === participantId
      const nextResult = isEditedPlayer
        ? { ...result, ...changes }
        : changes.wonTable === true
          ? { ...result, survived: false }
          : result
      return {
        ...nextResult,
        achievementPoints: calculateAchievementPoints(nextResult, config),
      }
    }),
  }))
}

export function saveTableResults(
  tournament: Tournament,
  roundId: string,
  tableId: string,
): Tournament {
  const { round, table } = findRoundAndTable(tournament, roundId, tableId)
  if (round.status !== 'active' && !(round.status === 'finished' && round.isCorrectionMode)) {
    throw new DomainError('La ronda debe estar activa para guardar resultados.')
  }
  if (table.status === 'saved') return tournament

  validateTableResults(table, tournament.participants)
  const config = achievementPointConfigFromTournament(tournament)
  const calculatedResults = table.results.map((result) => ({
    ...result,
    achievementPoints: calculateAchievementPoints(result, config),
  }))
  const savedAt = new Date().toISOString()

  return replaceTable(
    tournament,
    roundId,
    tableId,
    (currentTable) => ({
      ...currentTable,
      status: 'saved',
      results: calculatedResults,
      savedResults: calculatedResults.map((result) => ({ ...result })),
      lastSavedAt: savedAt,
    }),
    (currentRound) =>
      currentRound.status === 'finished'
        ? { ...currentRound, isCorrectionMode: false, lastEditedAt: savedAt }
        : currentRound,
  )
}

export function beginRoundCorrection(
  tournament: Tournament,
  roundId: string,
  now = new Date().toISOString(),
): Tournament {
  const round = tournament.rounds.find((item) => item.id === roundId)
  if (!round) throw new DomainError('No se encontró la ronda.')
  if (round.status !== 'finished') {
    throw new DomainError('Solo las rondas finalizadas requieren el modo de corrección administrativa.')
  }
  return {
    ...tournament,
    rounds: tournament.rounds.map((item) =>
      item.id === roundId
        ? {
            ...item,
            isCorrectionMode: true,
            wasEditedAfterFinish: true,
            lastEditedAt: now,
          }
        : item,
    ),
    updatedAt: now,
  }
}

export function beginTableCorrection(
  tournament: Tournament,
  roundId: string,
  tableId: string,
): Tournament {
  const { round, table } = findRoundAndTable(tournament, roundId, tableId)
  if (round.status !== 'active' && round.status !== 'finished') {
    throw new DomainError('Confirma las mesas antes de corregir resultados.')
  }
  if (table.status !== 'saved') {
    throw new DomainError('Esta mesa todavía no tiene resultados guardados.')
  }
  if (round.status === 'finished' && !round.isCorrectionMode) {
    throw new DomainError('Activa “Corregir ronda” antes de modificar resultados finalizados.')
  }

  return replaceTable(
    tournament,
    roundId,
    tableId,
    (currentTable) => ({
      ...currentTable,
      status: 'edited',
      editCount: currentTable.editCount + 1,
    }),
    (currentRound) => currentRound,
  )
}

export function getCommittedTableResults(table: CommanderTable): PlayerResult[] {
  if (table.status === 'saved') return table.results
  if (table.status === 'edited') return table.savedResults
  return []
}
