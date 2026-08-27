import { DomainError } from './errors'
import { syncSetupPrizeParticipants } from './prizes'
import type { IdFactory, Participant, Tournament } from './tournament'
import { createId } from '../utils/id'

export interface ParticipantImportReport {
  added: number
  addedParticipantIds: string[]
  addedNames: string[]
  blankLineNumbers: number[]
  duplicateNames: string[]
  existingNames: string[]
}

export interface ParticipantImportResult {
  tournament: Tournament
  report: ParticipantImportReport
}

export function canonicalizePlayerName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-CL')
}

export function cleanPlayerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export function createLocalPlayerKey(name: string): string {
  return `local-player:${canonicalizePlayerName(name)}`
}

export function importParticipants(
  tournament: Tournament,
  rawNames: string,
  idFactory: IdFactory = createId,
  resolvePlayerKey: (name: string) => string = createLocalPlayerKey,
): ParticipantImportResult {
  const lines = rawNames.split(/\r?\n/)
  const existingCanonicalNames = new Map(
    tournament.participants.map((participant) => [canonicalizePlayerName(participant.name), participant.name]),
  )
  const acceptedCanonicalNames = new Set<string>()
  const namesToAdd: string[] = []
  const blankLineNumbers: number[] = []
  const duplicateNames = new Set<string>()
  const existingNames = new Set<string>()

  lines.forEach((line, index) => {
    const name = cleanPlayerName(line)
    if (!name) {
      blankLineNumbers.push(index + 1)
      return
    }

    const canonicalName = canonicalizePlayerName(name)
    const existingName = existingCanonicalNames.get(canonicalName)
    if (existingName) {
      existingNames.add(existingName)
      return
    }
    if (acceptedCanonicalNames.has(canonicalName)) {
      duplicateNames.add(name)
      return
    }

    acceptedCanonicalNames.add(canonicalName)
    namesToAdd.push(name)
  })

  const participants: Participant[] = namesToAdd.map((name) => {
    const id = idFactory('participant')
    return {
      id,
      playerKey: resolvePlayerKey(name),
      name,
      active: true,
      isGhost: false,
    }
  })

  const now = new Date().toISOString()
  return {
    tournament: syncSetupPrizeParticipants({
      ...tournament,
      participants: [...tournament.participants, ...participants],
      updatedAt: now,
    }),
    report: {
      added: participants.length,
      addedParticipantIds: participants.map((participant) => participant.id),
      addedNames: participants.map((participant) => participant.name),
      blankLineNumbers,
      duplicateNames: [...duplicateNames],
      existingNames: [...existingNames],
    },
  }
}

export function renameParticipant(
  tournament: Tournament,
  participantId: string,
  nextName: string,
): Tournament {
  const name = cleanPlayerName(nextName)
  if (!name) throw new DomainError('El nombre del jugador no puede estar vacío.')

  const canonicalName = canonicalizePlayerName(name)
  const duplicate = tournament.participants.some(
    (participant) =>
      participant.id !== participantId && canonicalizePlayerName(participant.name) === canonicalName,
  )
  if (duplicate) throw new DomainError(`Ya existe un jugador llamado “${name}”.`)

  let found = false
  const participants = tournament.participants.map((participant) => {
    if (participant.id !== participantId) return participant
    found = true
    const usesLocalIdentity =
      participant.playerKey === participant.id || participant.playerKey.startsWith('local-player:')
    return {
      ...participant,
      name,
      playerKey: usesLocalIdentity ? createLocalPlayerKey(name) : participant.playerKey,
    }
  })
  if (!found) throw new DomainError('No se encontró el jugador que intentas editar.')

  return syncSetupPrizeParticipants({
    ...tournament,
    participants,
    updatedAt: new Date().toISOString(),
  })
}

export function removeParticipant(tournament: Tournament, participantId: string): Tournament {
  if (tournament.status !== 'setup') {
    throw new DomainError('Solo puedes eliminar jugadores antes de iniciar el torneo.')
  }

  const participants = tournament.participants.filter(
    (participant) => participant.id !== participantId,
  )
  if (participants.length === tournament.participants.length) {
    throw new DomainError('No se encontró el jugador que intentas eliminar.')
  }

  return syncSetupPrizeParticipants({
    ...tournament,
    participants,
    updatedAt: new Date().toISOString(),
  })
}

export function setParticipantActive(
  tournament: Tournament,
  participantId: string,
  active: boolean,
): Tournament {
  const participant = tournament.participants.find((item) => item.id === participantId)
  if (!participant) throw new DomainError('No se encontró el jugador.')
  if (participant.isGhost) {
    throw new DomainError('El Jugador Fantasma se administra automáticamente por ronda.')
  }
  if (participant.active === active) return tournament

  if (!active) {
    const currentRound = tournament.rounds.find(
      (round) => round.number === tournament.currentRound,
    )
    const isInPendingPairing =
      currentRound?.status === 'pending' &&
      currentRound.tables.some((table) => table.participantIds.includes(participantId))
    if (isInPendingPairing) {
      throw new DomainError('Confirma las mesas de la ronda antes de marcar este jugador como DROP.')
    }
  }

  return {
    ...tournament,
    participants: tournament.participants.map((item) =>
      item.id === participantId ? { ...item, active } : item,
    ),
    updatedAt: new Date().toISOString(),
  }
}
