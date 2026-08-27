import { DomainError } from './errors'
import type {
  CommanderTable,
  IdFactory,
  Participant,
  PlayerResult,
  Round,
  Tournament,
} from './tournament'
import { createId } from '../utils/id'
import { createPairingTables } from './pairing'

export type RandomSource = () => number

export function getRealActiveParticipants(tournament: Tournament): Participant[] {
  return tournament.participants.filter((participant) => participant.active && !participant.isGhost)
}

export function requiresGhostPairing(tournament: Tournament): boolean {
  return getRealActiveParticipants(tournament).length === 5
}

export function authorizeGhostPairing(
  tournament: Tournament,
  idFactory: IdFactory = createId,
): Tournament {
  if (!requiresGhostPairing(tournament)) {
    throw new DomainError('El Jugador Fantasma solo puede utilizarse con exactamente 5 jugadores reales activos.')
  }
  const ghosts = tournament.participants.filter((participant) => participant.isGhost)
  if (ghosts.length > 1) {
    throw new DomainError('Solo puede existir un Jugador Fantasma en el evento.')
  }
  if (ghosts.length === 1 && tournament.ghostPairingAuthorized) return tournament
  const ghost: Participant = ghosts[0] ?? {
    id: idFactory('ghost'),
    playerKey: `ghost:${tournament.id}`,
    name: 'Jugador Fantasma',
    active: true,
    isGhost: true,
  }
  return {
    ...tournament,
    ghostPairingAuthorized: true,
    participants: ghosts.length === 0 ? [...tournament.participants, ghost] : tournament.participants,
    updatedAt: new Date().toISOString(),
  }
}

export function distributeTableSizes(playerCount: number): number[] {
  if (!Number.isInteger(playerCount) || playerCount < 3) {
    throw new DomainError('Se necesitan al menos 3 jugadores activos para generar una ronda.')
  }

  for (let tablesOfFour = Math.floor(playerCount / 4); tablesOfFour >= 0; tablesOfFour -= 1) {
    const remainingPlayers = playerCount - tablesOfFour * 4
    if (remainingPlayers % 3 !== 0) continue

    const tablesOfThree = remainingPlayers / 3
    return [...Array(tablesOfFour).fill(4), ...Array(tablesOfThree).fill(3)]
  }

  throw new DomainError(
    `No existe una distribución válida de mesas de 3 o 4 para ${playerCount} jugadores.`,
  )
}

export function shuffleParticipants(
  participants: Participant[],
  random: RandomSource = Math.random,
): Participant[] {
  const shuffled = [...participants]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]]
  }
  return shuffled
}

export function createEmptyPlayerResult(participantId: string): PlayerResult {
  return {
    participantId,
    rotating1: false,
    rotating2: false,
    rotating3: false,
    rotating4: false,
    rotating5: false,
    wonTable: false,
    eliminations: 0,
    survived: false,
    achievementPoints: 0,
    specialLeaguePoints: 0,
  }
}

export function createRound(
  tournament: Tournament,
  roundNumber: number,
  random: RandomSource = Math.random,
  idFactory: IdFactory = createId,
  useGhost = tournament.ghostPairingAuthorized && requiresGhostPairing(tournament),
): Round {
  const realParticipants = getRealActiveParticipants(tournament)
  if (realParticipants.length === 5 && !useGhost) {
    throw new DomainError(
      'Hay 5 jugadores activos. Autoriza el Jugador Fantasma para generar dos mesas de 3.',
    )
  }
  if (useGhost && realParticipants.length !== 5) {
    throw new DomainError('El Jugador Fantasma solo es necesario con exactamente 5 jugadores reales activos.')
  }
  const ghost = tournament.participants.find((participant) => participant.isGhost)
  if (useGhost && !ghost) {
    throw new DomainError('Autoriza el Jugador Fantasma antes de generar la ronda.')
  }
  const activeParticipants = useGhost && ghost ? [...realParticipants, ghost] : realParticipants
  const tableSizes = distributeTableSizes(activeParticipants.length)
  const pairedTables = createPairingTables(tournament, activeParticipants, tableSizes, random)
  const roundId = idFactory('round')

  const tables: CommanderTable[] = pairedTables.map((tableParticipants, index) => {
    const participantIds = tableParticipants.map((participant) => participant.id)

    return {
      id: idFactory('table'),
      roundId,
      tableNumber: index + 1,
      participantIds,
      status: 'pending',
      results: tableParticipants
        .filter((participant) => !participant.isGhost)
        .map((participant) => createEmptyPlayerResult(participant.id)),
      savedResults: [],
      editCount: 0,
    }
  })

  const round: Round = {
    id: roundId,
    tournamentId: tournament.id,
    number: roundNumber,
    status: 'pending',
    tables,
    isCorrectionMode: false,
    wasEditedAfterFinish: false,
  }
  validateRoundAssignments(round, activeParticipants)
  return round
}

export function validateRoundAssignments(round: Round, activeParticipants: Participant[]): void {
  const activeParticipantIds = new Set(activeParticipants.map((participant) => participant.id))
  const assignedIds = round.tables.flatMap((table) => table.participantIds)
  const assignedSet = new Set(assignedIds)

  if (round.tables.some((table) => table.participantIds.length < 3 || table.participantIds.length > 4)) {
    throw new DomainError('Todas las mesas deben tener 3 o 4 jugadores.')
  }
  if (assignedSet.size !== assignedIds.length) {
    throw new DomainError('Un jugador no puede aparecer más de una vez en una ronda.')
  }
  const ghostIds = new Set(
    activeParticipants.filter((participant) => participant.isGhost).map((participant) => participant.id),
  )
  const assignedGhosts = assignedIds.filter((participantId) => ghostIds.has(participantId))
  if (assignedGhosts.length > 1) {
    throw new DomainError('Solo puede existir un Jugador Fantasma por ronda.')
  }
  if (assignedIds.some((participantId) => !activeParticipantIds.has(participantId))) {
    throw new DomainError('Las mesas solo pueden contener jugadores activos.')
  }
  if (
    assignedSet.size !== activeParticipantIds.size ||
    [...activeParticipantIds].some((participantId) => !assignedSet.has(participantId))
  ) {
    throw new DomainError('Todos los jugadores activos deben aparecer exactamente una vez.')
  }
}

function activeParticipantsSeatedInRound(
  tournament: Tournament,
  round: Round,
): Participant[] {
  const seatedIds = new Set(round.tables.flatMap((table) => table.participantIds))
  return tournament.participants.filter(
    (participant) => participant.active && seatedIds.has(participant.id),
  )
}

export function swapRoundPlayers(
  tournament: Tournament,
  roundId: string,
  firstParticipantId: string,
  secondParticipantId: string,
): Tournament {
  if (firstParticipantId === secondParticipantId) {
    throw new DomainError('Selecciona dos jugadores diferentes.')
  }

  const round = tournament.rounds.find((item) => item.id === roundId)
  if (!round) throw new DomainError('No se encontró la ronda.')
  if (round.status !== 'pending') {
    throw new DomainError('Solo puedes cambiar jugadores antes de confirmar las mesas.')
  }

  const firstTable = round.tables.find((table) => table.participantIds.includes(firstParticipantId))
  const secondTable = round.tables.find((table) => table.participantIds.includes(secondParticipantId))
  if (!firstTable || !secondTable) throw new DomainError('No se encontró uno de los jugadores.')
  if (firstTable.id === secondTable.id) {
    throw new DomainError('Elige un jugador que esté en otra mesa.')
  }

  const activeParticipants = activeParticipantsSeatedInRound(tournament, round)
  const activeIds = new Set(activeParticipants.map((participant) => participant.id))
  if (!activeIds.has(firstParticipantId) || !activeIds.has(secondParticipantId)) {
    throw new DomainError('Solo puedes intercambiar jugadores activos.')
  }

  const tables = round.tables.map((table) => {
    const participantIds = table.participantIds.map((participantId) => {
      if (table.id === firstTable.id && participantId === firstParticipantId) {
        return secondParticipantId
      }
      if (table.id === secondTable.id && participantId === secondParticipantId) {
        return firstParticipantId
      }
      return participantId
    })

    return {
      ...table,
      participantIds,
      results: participantIds.flatMap((participantId) => {
        const participant = tournament.participants.find((item) => item.id === participantId)
        if (participant?.isGhost) return []
        const existingResult = table.results.find((result) => result.participantId === participantId)
        return [existingResult ?? createEmptyPlayerResult(participantId)]
      }),
      savedResults: [],
      editCount: 0,
      lastSavedAt: undefined,
    }
  })

  const updatedRound = { ...round, tables }
  validateRoundAssignments(updatedRound, activeParticipants)

  return {
    ...tournament,
    rounds: tournament.rounds.map((item) => (item.id === roundId ? updatedRound : item)),
    updatedAt: new Date().toISOString(),
  }
}

export function confirmRoundTables(tournament: Tournament, roundId: string): Tournament {
  const round = tournament.rounds.find((item) => item.id === roundId)
  if (!round) throw new DomainError('No se encontró la ronda.')
  if (round.status !== 'pending') return tournament

  validateRoundAssignments(
    round,
    activeParticipantsSeatedInRound(tournament, round),
  )

  return {
    ...tournament,
    rounds: tournament.rounds.map((item) =>
      item.id === roundId ? { ...item, status: 'active' as const } : item,
    ),
    updatedAt: new Date().toISOString(),
  }
}
