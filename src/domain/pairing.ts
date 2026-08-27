import { calculateTournamentStanding } from './leaderboard'
import type { PairingMode, Participant, Tournament } from './tournament'

export type PairingRandomSource = () => number

export const PAIRING_MODE_LABELS: Record<PairingMode, string> = {
  balanced_random: 'Aleatorio equilibrado',
  swiss: 'Suizo multijugador',
}

export const PAIRING_MODE_DESCRIPTIONS: Record<PairingMode, string> = {
  balanced_random:
    'Mezcla a los jugadores y busca la distribución con menos rivales repetidos.',
  swiss:
    'Agrupa por Standing del evento, evita rematches y realiza los ajustes necesarios para formar mesas de 3 o 4.',
}

interface PairingContext {
  encounterCounts: Map<string, number>
  ghostExposureCounts: Map<string, number>
  standingPoints: Map<string, number>
  standingPositions: Map<string, number>
  hasStandingData: boolean
}

export interface PairingDiagnostics {
  repeatedPairs: number
  repeatedEncounterWeight: number
  maximumPriorMeetings: number
  maximumPlayerRepeatLoad: number
  ghostExposure: number
  swissScoreSpread: number
  swissPairDistance: number
  swissRankDistance: number
}

function pairKey(firstParticipantId: string, secondParticipantId: string): string {
  return firstParticipantId < secondParticipantId
    ? `${firstParticipantId}::${secondParticipantId}`
    : `${secondParticipantId}::${firstParticipantId}`
}

function shuffle<T>(values: T[], random: PairingRandomSource): T[] {
  const shuffled = [...values]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]]
  }
  return shuffled
}

function buildPairingContext(tournament: Tournament): PairingContext {
  const participantById = new Map(
    tournament.participants.map((participant) => [participant.id, participant]),
  )
  const encounterCounts = new Map<string, number>()
  const ghostExposureCounts = new Map<string, number>()

  tournament.rounds.forEach((round) => {
    round.tables.forEach((table) => {
      const realParticipantIds = table.participantIds.filter(
        (participantId) => !participantById.get(participantId)?.isGhost,
      )
      const hasGhost = table.participantIds.some(
        (participantId) => participantById.get(participantId)?.isGhost,
      )
      if (hasGhost) {
        realParticipantIds.forEach((participantId) => {
          ghostExposureCounts.set(
            participantId,
            (ghostExposureCounts.get(participantId) ?? 0) + 1,
          )
        })
      }
      for (let firstIndex = 0; firstIndex < realParticipantIds.length; firstIndex += 1) {
        for (
          let secondIndex = firstIndex + 1;
          secondIndex < realParticipantIds.length;
          secondIndex += 1
        ) {
          const key = pairKey(realParticipantIds[firstIndex], realParticipantIds[secondIndex])
          encounterCounts.set(key, (encounterCounts.get(key) ?? 0) + 1)
        }
      }
    })
  })

  const standing = calculateTournamentStanding(tournament)
  return {
    encounterCounts,
    ghostExposureCounts,
    standingPoints: new Map(standing.map((entry) => [entry.participantId, entry.totalPoints])),
    standingPositions: new Map(standing.map((entry) => [entry.participantId, entry.position])),
    hasStandingData: standing.some((entry) => entry.savedTables > 0),
  }
}

export function inspectPairing(
  tournament: Tournament,
  tables: Participant[][],
): PairingDiagnostics {
  const context = buildPairingContext(tournament)
  return inspectPairingWithContext(context, tables)
}

function inspectPairingWithContext(
  context: PairingContext,
  tables: Participant[][],
): PairingDiagnostics {
  const playerRepeatLoads = new Map<string, number>()
  let repeatedPairs = 0
  let repeatedEncounterWeight = 0
  let maximumPriorMeetings = 0
  let ghostExposure = 0
  let swissScoreSpread = 0
  let swissPairDistance = 0
  let swissRankDistance = 0

  tables.forEach((table) => {
    const realParticipants = table.filter((participant) => !participant.isGhost)
    if (table.some((participant) => participant.isGhost)) {
      ghostExposure += realParticipants.reduce(
        (total, participant) => total + (context.ghostExposureCounts.get(participant.id) ?? 0),
        0,
      )
    }
    const scores = realParticipants.map(
      (participant) => context.standingPoints.get(participant.id) ?? 0,
    )
    if (scores.length > 1) {
      swissScoreSpread += Math.max(...scores) - Math.min(...scores)
    }
    for (let firstIndex = 0; firstIndex < realParticipants.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < realParticipants.length;
        secondIndex += 1
      ) {
        const first = realParticipants[firstIndex]
        const second = realParticipants[secondIndex]
        const meetings = context.encounterCounts.get(pairKey(first.id, second.id)) ?? 0
        if (meetings > 0) repeatedPairs += 1
        repeatedEncounterWeight += meetings * meetings
        maximumPriorMeetings = Math.max(maximumPriorMeetings, meetings)
        playerRepeatLoads.set(first.id, (playerRepeatLoads.get(first.id) ?? 0) + meetings)
        playerRepeatLoads.set(second.id, (playerRepeatLoads.get(second.id) ?? 0) + meetings)
        swissPairDistance += Math.abs(
          (context.standingPoints.get(first.id) ?? 0) -
            (context.standingPoints.get(second.id) ?? 0),
        )
        swissRankDistance += Math.abs(
          (context.standingPositions.get(first.id) ?? 0) -
            (context.standingPositions.get(second.id) ?? 0),
        )
      }
    }
  })

  return {
    repeatedPairs,
    repeatedEncounterWeight,
    maximumPriorMeetings,
    maximumPlayerRepeatLoad: Math.max(0, ...playerRepeatLoads.values()),
    ghostExposure,
    swissScoreSpread,
    swissPairDistance,
    swissRankDistance,
  }
}

function diagnosticCost(
  diagnostics: PairingDiagnostics,
  mode: PairingMode,
  hasStandingData: boolean,
): number[] {
  const repeatCost = [
    diagnostics.repeatedPairs,
    diagnostics.maximumPriorMeetings,
    diagnostics.repeatedEncounterWeight,
    diagnostics.maximumPlayerRepeatLoad,
  ]
  if (mode === 'swiss' && hasStandingData) {
    return [
      diagnostics.ghostExposure,
      ...repeatCost,
      diagnostics.swissScoreSpread,
      diagnostics.swissPairDistance,
      diagnostics.swissRankDistance,
    ]
  }
  return [diagnostics.ghostExposure, ...repeatCost]
}

function compareCosts(first: number[], second: number[]): number {
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    const difference = (first[index] ?? 0) - (second[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function partitionParticipants(
  participants: Participant[],
  tableSizes: number[],
): Participant[][] {
  let offset = 0
  return tableSizes.map((size) => {
    const table = participants.slice(offset, offset + size)
    offset += size
    return table
  })
}

function createSeed(
  participants: Participant[],
  tableSizes: number[],
  mode: PairingMode,
  context: PairingContext,
  random: PairingRandomSource,
  restart: number,
): Participant[][] {
  let ordered = shuffle(participants, random)
  if (mode === 'swiss' && context.hasStandingData && restart % 3 !== 2) {
    ordered.sort(
      (first, second) =>
        (context.standingPoints.get(second.id) ?? 0) -
          (context.standingPoints.get(first.id) ?? 0) ||
        (context.standingPositions.get(first.id) ?? Number.MAX_SAFE_INTEGER) -
          (context.standingPositions.get(second.id) ?? Number.MAX_SAFE_INTEGER),
    )
  }
  const ghost = ordered.find((participant) => participant.isGhost)
  if (ghost) {
    ordered = [ghost, ...ordered.filter((participant) => !participant.isGhost)]
  }
  return partitionParticipants(ordered, tableSizes)
}

function optimizeBySwapping(
  initialTables: Participant[][],
  mode: PairingMode,
  context: PairingContext,
): Participant[][] {
  let tables = initialTables.map((table) => [...table])
  let cost = diagnosticCost(
    inspectPairingWithContext(context, tables),
    mode,
    context.hasStandingData,
  )
  const maximumIterations = Math.max(12, tables.flat().length * 2)

  for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
    let bestTables: Participant[][] | undefined
    let bestCost = cost
    for (let firstTableIndex = 0; firstTableIndex < tables.length; firstTableIndex += 1) {
      for (
        let secondTableIndex = firstTableIndex + 1;
        secondTableIndex < tables.length;
        secondTableIndex += 1
      ) {
        for (let firstSeat = 0; firstSeat < tables[firstTableIndex].length; firstSeat += 1) {
          if (tables[firstTableIndex][firstSeat].isGhost) continue
          for (let secondSeat = 0; secondSeat < tables[secondTableIndex].length; secondSeat += 1) {
            if (tables[secondTableIndex][secondSeat].isGhost) continue
            const candidate = tables.map((table) => [...table])
            ;[
              candidate[firstTableIndex][firstSeat],
              candidate[secondTableIndex][secondSeat],
            ] = [
              candidate[secondTableIndex][secondSeat],
              candidate[firstTableIndex][firstSeat],
            ]
            const candidateCost = diagnosticCost(
              inspectPairingWithContext(context, candidate),
              mode,
              context.hasStandingData,
            )
            if (compareCosts(candidateCost, bestCost) < 0) {
              bestTables = candidate
              bestCost = candidateCost
            }
          }
        }
      }
    }
    if (!bestTables) break
    tables = bestTables
    cost = bestCost
  }
  return tables
}

export function createPairingTables(
  tournament: Tournament,
  participants: Participant[],
  tableSizes: number[],
  random: PairingRandomSource = Math.random,
): Participant[][] {
  const context = buildPairingContext(tournament)
  const mode = tournament.pairingMode ?? 'balanced_random'
  const restartCount = participants.length <= 16 ? 20 : participants.length <= 28 ? 12 : 8
  let bestTables: Participant[][] | undefined
  let bestCost: number[] | undefined

  for (let restart = 0; restart < restartCount; restart += 1) {
    const seed = createSeed(participants, tableSizes, mode, context, random, restart)
    const candidate = optimizeBySwapping(
      seed,
      mode,
      context,
    )
    const cost = diagnosticCost(
      inspectPairingWithContext(context, candidate),
      mode,
      context.hasStandingData,
    )
    if (!bestCost || compareCosts(cost, bestCost) < 0) {
      bestTables = candidate
      bestCost = cost
    }
  }

  return bestTables ?? partitionParticipants(participants, tableSizes)
}
