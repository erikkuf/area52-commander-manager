import { DomainError } from './errors'
import { canonicalizePlayerName, createLocalPlayerKey } from './participants'
import type { LeaguePrizeLedger, Tournament } from './tournament'

export interface PlayerIdentity {
  playerKey: string
  canonicalName: string
  aliases: string[]
  createdAt: string
  updatedAt: string
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>()
  return names.filter((name) => {
    const canonical = canonicalizePlayerName(name)
    if (!canonical || seen.has(canonical)) return false
    seen.add(canonical)
    return true
  })
}

export function buildPlayerRegistry(
  tournaments: Tournament[],
  existing: PlayerIdentity[] = [],
  now = new Date().toISOString(),
): PlayerIdentity[] {
  const registry = new Map(existing.map((identity) => [identity.playerKey, {
    ...identity,
    aliases: [...identity.aliases],
  }]))
  tournaments.forEach((tournament) => tournament.participants.forEach((participant) => {
    if (participant.isGhost) return
    const current = registry.get(participant.playerKey)
    if (current) {
      const aliases = uniqueNames([...current.aliases, participant.name])
      registry.set(participant.playerKey, {
        ...current,
        aliases,
        updatedAt: JSON.stringify(aliases) === JSON.stringify(current.aliases)
          ? current.updatedAt
          : now,
      })
      return
    }
    registry.set(participant.playerKey, {
      playerKey: participant.playerKey,
      canonicalName: participant.name,
      aliases: [participant.name],
      createdAt: now,
      updatedAt: now,
    })
  }))
  return [...registry.values()].sort((first, second) =>
    first.canonicalName.localeCompare(second.canonicalName, 'es-CL'),
  )
}

export function resolveRegisteredPlayerKey(
  registry: PlayerIdentity[],
  playerName: string,
): string {
  const canonical = canonicalizePlayerName(playerName)
  const matches = registry.filter((identity) =>
    canonicalizePlayerName(identity.canonicalName) === canonical ||
    identity.aliases.some((alias) => canonicalizePlayerName(alias) === canonical),
  )
  return matches.length === 1 ? matches[0].playerKey : createLocalPlayerKey(playerName)
}

export interface PlayerIdentityMergeResult {
  tournaments: Tournament[]
  ledger: LeaguePrizeLedger
  registry: PlayerIdentity[]
}

export function mergePlayerIdentities(
  tournaments: Tournament[],
  ledger: LeaguePrizeLedger,
  registry: PlayerIdentity[],
  sourcePlayerKey: string,
  targetPlayerKey: string,
  canonicalName?: string,
  now = new Date().toISOString(),
): PlayerIdentityMergeResult {
  if (sourcePlayerKey === targetPlayerKey) {
    throw new DomainError('Selecciona dos identidades diferentes para unificarlas.')
  }
  const source = registry.find((identity) => identity.playerKey === sourcePlayerKey)
  const target = registry.find((identity) => identity.playerKey === targetPlayerKey)
  if (!source || !target) throw new DomainError('No se encontró una de las identidades seleccionadas.')
  const conflict = tournaments.find((tournament) => {
    const keys = tournament.participants.filter((participant) => !participant.isGhost).map((participant) => participant.playerKey)
    return keys.includes(sourcePlayerKey) && keys.includes(targetPlayerKey)
  })
  if (conflict) {
    throw new DomainError(`No se pueden unificar porque ambas identidades participan en “${conflict.name}”.`)
  }

  const mergedName = canonicalName?.trim() || target.canonicalName
  const nextTournaments = tournaments.map((tournament) => ({
    ...tournament,
    participants: tournament.participants.map((participant) =>
      participant.playerKey === sourcePlayerKey
        ? { ...participant, playerKey: targetPlayerKey, name: mergedName }
        : participant,
    ),
  }))
  const replaceKey = (playerKey: string) => playerKey === sourcePlayerKey ? targetPlayerKey : playerKey
  const nextLedger: LeaguePrizeLedger = {
    ...ledger,
    creditMovements: ledger.creditMovements.map((movement) => ({
      ...movement,
      playerKey: replaceKey(movement.playerKey),
    })),
    specialPointMovements: ledger.specialPointMovements.map((movement) => ({
      ...movement,
      playerKey: replaceKey(movement.playerKey),
    })),
    leaguePeriods: ledger.leaguePeriods.map((period) => ({
      ...period,
      finalizedMonthlyAwards: period.finalizedMonthlyAwards?.map((award) => ({
        ...award,
        playerKey: replaceKey(award.playerKey),
      })),
      latestTheoreticalMonthlyAwards: period.latestTheoreticalMonthlyAwards?.map((award) => ({
        ...award,
        playerKey: replaceKey(award.playerKey),
      })),
      finalizedLeaderboardPlayerKeys: period.finalizedLeaderboardPlayerKeys?.map(replaceKey),
      administrativeLeaderboardPlayerKeys: period.administrativeLeaderboardPlayerKeys?.map(replaceKey),
      financialReviewRequired: period.status === 'finished' ? true : period.financialReviewRequired,
      reviewRequired: period.status === 'finished' ? true : period.reviewRequired,
    })),
  }
  const mergedIdentity: PlayerIdentity = {
    ...target,
    canonicalName: mergedName,
    aliases: uniqueNames([
      ...target.aliases,
      target.canonicalName,
      ...source.aliases,
      source.canonicalName,
      mergedName,
    ]),
    updatedAt: now,
  }
  const nextRegistry = buildPlayerRegistry(
    nextTournaments,
    registry.filter((identity) => identity.playerKey !== sourcePlayerKey && identity.playerKey !== targetPlayerKey).concat(mergedIdentity),
    now,
  )
  return { tournaments: nextTournaments, ledger: nextLedger, registry: nextRegistry }
}
