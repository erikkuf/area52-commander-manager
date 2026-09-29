import { DomainError } from './errors'
import type {
  IdFactory,
  LeagueAchievementDefinition,
  LeaguePeriod,
  RotatingAchievementDefinition,
  SpecialPointMovement,
  Tournament,
  TournamentPenaltyDefinition,
  TournamentRotatingAchievementSnapshot,
} from './tournament'
import { createId } from '../utils/id'

export const MAX_SELECTED_ROTATING_ACHIEVEMENTS = 5
export const DEFAULT_SELECTED_ROTATING_ACHIEVEMENTS = 3

const DEFAULT_CREATED_AT = '2026-01-01T00:00:00.000Z'

export const DEFAULT_ROTATING_ACHIEVEMENT_CATALOG: RotatingAchievementDefinition[] = [
  {
    id: 'rotating-definition:first-blood',
    name: 'Primera sangre',
    description: 'Elimina al primer jugador de la mesa.',
    points: 1,
    active: true,
    createdAt: DEFAULT_CREATED_AT,
    updatedAt: DEFAULT_CREATED_AT,
  },
  {
    id: 'rotating-definition:commander-attack',
    name: 'Comandante al ataque',
    description: 'Cumple el objetivo rotativo Comandante al ataque.',
    points: 1,
    active: true,
    createdAt: DEFAULT_CREATED_AT,
    updatedAt: DEFAULT_CREATED_AT,
  },
  {
    id: 'rotating-definition:unexpected-pact',
    name: 'Pacto inesperado',
    description: 'Cumple el objetivo rotativo Pacto inesperado.',
    points: 1,
    active: true,
    createdAt: DEFAULT_CREATED_AT,
    updatedAt: DEFAULT_CREATED_AT,
  },
]

export const DEFAULT_LEAGUE_ACHIEVEMENT_CATALOG: LeagueAchievementDefinition[] = []
export const DEFAULT_TOURNAMENT_PENALTY_CATALOG: TournamentPenaltyDefinition[] = []

export interface AchievementDefinitionDraft {
  name: string
  description?: string
  points: number
  active?: boolean
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function validateDefinition(draft: AchievementDefinitionDraft): void {
  if (!normalizeName(draft.name)) {
    throw new DomainError('El nombre de la definición es obligatorio.')
  }
  if (!Number.isInteger(draft.points) || draft.points === 0) {
    throw new DomainError('Los puntos deben ser un entero distinto de 0.')
  }
}

export function createRotatingAchievementDefinition(
  draft: AchievementDefinitionDraft,
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): RotatingAchievementDefinition {
  validateDefinition(draft)
  return {
    id: idFactory('rotating-definition'),
    name: normalizeName(draft.name),
    description: draft.description?.trim() ?? '',
    points: draft.points,
    active: draft.active ?? true,
    createdAt: now,
    updatedAt: now,
  }
}

export function createLeagueAchievementDefinition(
  draft: AchievementDefinitionDraft,
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): LeagueAchievementDefinition {
  validateDefinition(draft)
  return {
    id: idFactory('league-definition'),
    name: normalizeName(draft.name),
    description: draft.description?.trim() ?? '',
    points: draft.points,
    active: draft.active ?? true,
    createdAt: now,
    updatedAt: now,
  }
}

export function createTournamentPenaltyDefinition(
  draft: AchievementDefinitionDraft,
  idFactory: IdFactory = createId,
  now = new Date().toISOString(),
): TournamentPenaltyDefinition {
  validateDefinition(draft)
  if (draft.points >= 0) throw new DomainError('Una penalización debe tener puntos negativos.')
  return {
    id: idFactory('tournament-penalty-definition'),
    name: normalizeName(draft.name),
    description: draft.description?.trim() ?? '',
    points: draft.points,
    active: draft.active ?? true,
    createdAt: now,
    updatedAt: now,
  }
}

function updateDefinition<T extends RotatingAchievementDefinition | LeagueAchievementDefinition | TournamentPenaltyDefinition>(
  definitions: T[],
  id: string,
  draft: AchievementDefinitionDraft,
  now = new Date().toISOString(),
): T[] {
  validateDefinition(draft)
  if (!definitions.some((definition) => definition.id === id)) {
    throw new DomainError('No se encontró la definición solicitada.')
  }
  return definitions.map((definition) => definition.id === id ? {
    ...definition,
    name: normalizeName(draft.name),
    description: draft.description?.trim() ?? '',
    points: draft.points,
    active: draft.active ?? definition.active,
    updatedAt: now,
  } : definition)
}

export const updateRotatingAchievementDefinition = updateDefinition<RotatingAchievementDefinition>
export const updateLeagueAchievementDefinition = updateDefinition<LeagueAchievementDefinition>
export function updateTournamentPenaltyDefinition(
  definitions: TournamentPenaltyDefinition[],
  id: string,
  draft: AchievementDefinitionDraft,
  now = new Date().toISOString(),
): TournamentPenaltyDefinition[] {
  if (draft.points >= 0) throw new DomainError('Una penalización debe tener puntos negativos.')
  return updateDefinition(definitions, id, draft, now)
}

export function deleteCatalogDefinition<T extends { id: string }>(definitions: T[], id: string): T[] {
  if (!definitions.some((definition) => definition.id === id)) {
    throw new DomainError('No se encontró la definición solicitada.')
  }
  return definitions.filter((definition) => definition.id !== id)
}

export function snapshotRotatingAchievement(
  definition: RotatingAchievementDefinition,
): TournamentRotatingAchievementSnapshot {
  return {
    id: definition.id,
    sourceDefinitionId: definition.id,
    name: definition.name,
    description: definition.description,
    points: definition.points,
    enabled: true,
  }
}

export function validateRotatingAchievementSelection(
  snapshots: TournamentRotatingAchievementSnapshot[],
): void {
  if (snapshots.length < 1 || snapshots.length > MAX_SELECTED_ROTATING_ACHIEVEMENTS) {
    throw new DomainError(
      `Selecciona entre 1 y ${MAX_SELECTED_ROTATING_ACHIEVEMENTS} logros rotativos.`,
    )
  }
  if (new Set(snapshots.map((snapshot) => snapshot.id)).size !== snapshots.length) {
    throw new DomainError('Un logro rotativo no puede seleccionarse más de una vez.')
  }
  if (snapshots.some((snapshot) => !snapshot.name.trim())) {
    throw new DomainError('Todos los logros rotativos deben tener nombre.')
  }
  if (snapshots.some((snapshot) => !Number.isInteger(snapshot.points) || snapshot.points === 0)) {
    throw new DomainError('Cada logro rotativo debe tener un valor entero distinto de 0.')
  }
}

function semanticKey(name: string, description: string, points: number): string {
  return `${normalizeName(name).toLocaleLowerCase('es-CL')}|${description.trim().toLocaleLowerCase('es-CL')}|${points}`
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function deterministicLegacyDefinitionId(
  kind: 'rotating' | 'league',
  name: string,
  description: string,
  points: number,
): string {
  return `${kind}-definition:legacy-${stableHash(semanticKey(name, description, points))}`
}

export function buildRotatingAchievementCatalog(
  existing: RotatingAchievementDefinition[] | undefined,
  tournaments: Tournament[],
  leaguePeriods: LeaguePeriod[] = [],
): RotatingAchievementDefinition[] {
  // Un catálogo persistido, incluso vacío, es una decisión del staff. Reconstruir
  // desde snapshots aquí reviviría definiciones eliminadas al recargar/importar.
  if (existing) return existing.map((definition) => ({ ...definition }))
  const definitions = DEFAULT_ROTATING_ACHIEVEMENT_CATALOG
    .map((definition) => ({ ...definition }))
  const keys = new Map(
    definitions.map((definition) => [
      semanticKey(definition.name, definition.description, definition.points),
      definition.id,
    ]),
  )
  const snapshots = [
    ...tournaments.flatMap((tournament) => tournament.rotatingAchievements),
    ...leaguePeriods.flatMap((period) => period.defaultRotatingAchievements),
  ]
  snapshots.forEach((snapshot) => {
    const key = semanticKey(snapshot.name, snapshot.description, snapshot.points)
    if (keys.has(key)) return
    const id = snapshot.sourceDefinitionId ?? deterministicLegacyDefinitionId(
      'rotating', snapshot.name, snapshot.description, snapshot.points,
    )
    if (definitions.some((definition) => definition.id === id)) return
    definitions.push({
      id,
      name: snapshot.name,
      description: snapshot.description,
      points: snapshot.points,
      active: false,
      createdAt: DEFAULT_CREATED_AT,
      updatedAt: DEFAULT_CREATED_AT,
    })
    keys.set(key, id)
  })
  return definitions
}

export function buildLeagueAchievementCatalog(
  existing: LeagueAchievementDefinition[] | undefined,
  movements: SpecialPointMovement[] = [],
): LeagueAchievementDefinition[] {
  if (existing) return existing.map((definition) => ({ ...definition }))
  const definitions = DEFAULT_LEAGUE_ACHIEVEMENT_CATALOG
    .map((definition) => ({ ...definition }))
  const keys = new Set(
    definitions.map((definition) => semanticKey(
      definition.name, definition.description, definition.points,
    )),
  )
  movements.forEach((movement) => {
    const name = movement.name ?? movement.reason
    if (!name) return
    const description = movement.description ?? ''
    const key = semanticKey(name, description, movement.amount)
    if (keys.has(key)) return
    const id = movement.sourceDefinitionId ?? deterministicLegacyDefinitionId(
      'league', name, description, movement.amount,
    )
    if (definitions.some((definition) => definition.id === id)) return
    definitions.push({
      id,
      name,
      description,
      points: movement.amount,
      active: false,
      createdAt: movement.createdAt,
      updatedAt: movement.createdAt,
    })
    keys.add(key)
  })
  return definitions
}

export function buildTournamentPenaltyCatalog(
  existing: TournamentPenaltyDefinition[] | undefined,
): TournamentPenaltyDefinition[] {
  return (existing ?? DEFAULT_TOURNAMENT_PENALTY_CATALOG)
    .map((definition) => ({ ...definition }))
}
