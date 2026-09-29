import { describe, expect, it } from 'vitest'
import {
  buildLeagueAchievementCatalog,
  buildRotatingAchievementCatalog,
  createLeagueAchievementDefinition,
  createRotatingAchievementDefinition,
  deleteCatalogDefinition,
  snapshotRotatingAchievement,
  updateLeagueAchievementDefinition,
  updateRotatingAchievementDefinition,
  validateRotatingAchievementSelection,
} from './achievementCatalogs'
import {
  calculateAchievementCount,
  calculateAchievementPoints,
  DEFAULT_ACHIEVEMENT_CONFIG,
  migratePlayerResultRotatingAchievements,
  normalizeRotatingAchievementSnapshots,
} from './achievements'
import { compareTournamentStandingMetrics } from './leaderboard'
import { registerSpecialPointMovement } from './specialPoints'
import { createTournament } from './tournamentOperations'
import { createDefaultLeaguePeriod } from './prizes'
import { createEmptyWorkspace, ensureWorkspaceAchievementCatalogs, upsertWorkspaceTournament } from './workspace'
import { deserializeAppWorkspace, serializeAppWorkspace } from '../services/localStorageAppWorkspaceRepository'
import type { PlayerResult, TournamentRotatingAchievementSnapshot } from './tournament'

const ids = (prefix: string) => `${prefix}-id`
const now = '2026-09-22T12:00:00.000Z'

const result = (ids: string[]): PlayerResult => ({
  participantId: 'player-a',
  rotatingAchievementIds: ids,
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
})

describe('catálogo de logros rotativos', () => {
  it('acepta puntos positivos o negativos, pero rechaza cero y decimales', () => {
    expect(createRotatingAchievementDefinition({ name: 'Objetivo A', points: 2 }, ids, now))
      .toMatchObject({ name: 'Objetivo A', points: 2, active: true })
    expect(createRotatingAchievementDefinition({ name: 'Penalización A', points: -2 }, ids, now))
      .toMatchObject({ points: -2 })
    expect(() => createRotatingAchievementDefinition({ name: 'Cero', points: 0 }, ids, now))
      .toThrow(/entero distinto de 0/)
    expect(() => createRotatingAchievementDefinition({ name: 'Decimal', points: 1.5 }, ids, now))
      .toThrow(/entero distinto de 0/)
  })

  it('mantiene el catálogo sin límite rígido, pero bloquea una sexta selección', () => {
    const catalog = Array.from({ length: 6 }, (_, index) =>
      createRotatingAchievementDefinition(
        { name: `Definición ${index + 1}`, points: 1 },
        () => `definition-${index + 1}`,
        now,
      ))
    expect(catalog).toHaveLength(6)
    expect(() => validateRotatingAchievementSelection(catalog.map(snapshotRotatingAchievement)))
      .toThrow(/entre 1 y 5/)
    expect(() => validateRotatingAchievementSelection(catalog.slice(0, 5).map(snapshotRotatingAchievement)))
      .not.toThrow()
    expect(() => createTournament({
      name: 'Evento anónimo',
      date: '2026-09-22',
      totalRounds: 1,
      rotating1: 'A',
      rotating2: 'B',
      rotating3: 'C',
      rotatingAchievements: catalog.map(snapshotRotatingAchievement),
      prizePool: 0,
      percentagesByPosition: [100],
      prizeMode: 'none',
      type: 'independent',
    })).toThrow(/entre 1 y 5/)
  })

  it('editar el catálogo no muta el snapshot ya copiado a una fecha', () => {
    const definition = createRotatingAchievementDefinition(
      { name: 'Objetivo original', description: 'Texto original', points: 2 }, ids, now,
    )
    const snapshot = snapshotRotatingAchievement(definition)
    const edited = updateRotatingAchievementDefinition(
      [definition], definition.id,
      { name: 'Objetivo editado', description: 'Texto nuevo', points: 5 },
      '2026-09-23T12:00:00.000Z',
    )[0]
    expect(edited).toMatchObject({ name: 'Objetivo editado', points: 5 })
    expect(snapshot).toMatchObject({ name: 'Objetivo original', points: 2 })
  })

  it('una penalización baja totalPoints y nunca aumenta achievementCount', () => {
    const snapshots: TournamentRotatingAchievementSnapshot[] = [
      { id: 'positive', name: 'Logro', description: '', points: 2, enabled: true },
      { id: 'penalty', name: 'Penalización', description: '', points: -1, enabled: true },
      { id: 'zero-legacy', name: 'Sin valor', description: '', points: 0, enabled: true },
    ]
    const obtained = result(['positive', 'penalty', 'zero-legacy'])
    expect(calculateAchievementPoints(obtained, DEFAULT_ACHIEVEMENT_CONFIG, snapshots)).toBe(1)
    expect(calculateAchievementCount(obtained, DEFAULT_ACHIEVEMENT_CONFIG, snapshots)).toBe(1)

    const withoutPenalty = { totalPoints: 5, tableWins: 1, achievementCount: 1, eliminations: 0 }
    const withPenalty = { totalPoints: 4, tableWins: 1, achievementCount: 1, eliminations: 0 }
    expect(compareTournamentStandingMetrics(withoutPenalty, withPenalty)).toBeLessThan(0)
  })

  it('migra rotating1–rotating5, deduplica IDs y permite recalcular con el snapshot', () => {
    const config = {
      ...DEFAULT_ACHIEVEMENT_CONFIG,
      rotating4: { enabled: true, points: 2 },
      rotating5: { enabled: true, points: -1 },
    }
    const snapshots = normalizeRotatingAchievementSnapshots([
      { id: 'rotating1', label: 'Uno', points: 1 },
      { id: 'rotating4', label: 'Cuatro', points: 2 },
      { id: 'rotating5', label: 'Cinco', points: -1 },
      { id: 'rotating5', label: 'Duplicado', points: -1 },
    ], config)
    const migrated = migratePlayerResultRotatingAchievements({
      ...result([]), rotating1: true, rotating4: true, rotating5: true,
    }, snapshots)
    expect(snapshots).toHaveLength(3)
    expect(migrated.rotatingAchievementIds).toEqual(['rotating1', 'rotating4', 'rotating5'])
    expect(calculateAchievementPoints(migrated, config, snapshots)).toBe(2)
    expect(calculateAchievementCount(migrated, config, snapshots)).toBe(2)
  })

  it('reconstruye definiciones legacy idempotentemente', () => {
    const snapshots: TournamentRotatingAchievementSnapshot[] = [
      { id: 'legacy-one', name: 'Objetivo heredado', description: '', points: 1, enabled: true },
    ]
    const tournament = { rotatingAchievements: snapshots } as never
    const once = buildRotatingAchievementCatalog(undefined, [tournament])
    const twice = buildRotatingAchievementCatalog(once, [tournament])
    expect(twice).toEqual(once)
    expect(once.filter((item) => item.name === 'Objetivo heredado')).toHaveLength(1)
  })

  it('eliminar una definición no toca un Tournament ni reaparece al recargar', () => {
    const definition = createRotatingAchievementDefinition({ name: 'Logro eliminable', points: 2 }, ids, now)
    const tournament = createTournament({
      name: 'Fecha de prueba', date: '2026-09-22', totalRounds: 1,
      rotating1: 'A', rotating2: 'B', rotating3: 'C',
      rotatingAchievements: [snapshotRotatingAchievement(definition),
        ...buildRotatingAchievementCatalog(undefined, []).slice(0, 2).map(snapshotRotatingAchievement)],
      type: 'independent', prizeMode: 'none', prizePool: 0,
      percentagesByPosition: [100],
    })
    const workspace = upsertWorkspaceTournament(createEmptyWorkspace(), tournament)
    workspace.rotatingAchievementCatalog = [definition]
    const deleted = {
      ...workspace,
      rotatingAchievementCatalog: deleteCatalogDefinition(workspace.rotatingAchievementCatalog, definition.id),
    }
    const restored = deserializeAppWorkspace(serializeAppWorkspace(deleted))!
    const league = createDefaultLeaguePeriod(ids)
    const selectedLeague = {
      ...league,
      defaultRotatingAchievements: [snapshotRotatingAchievement(definition),
        ...league.defaultRotatingAchievements.slice(1)],
    }
    expect(restored.rotatingAchievementCatalog).toEqual([])
    expect(ensureWorkspaceAchievementCatalogs(restored, {
      leaguePeriods: [selectedLeague], contributions: [], creditMovements: [],
      specialPointMovements: [], championSnapshots: [],
    }).rotatingAchievementCatalog).toEqual([])
    expect(restored.tournaments[0].rotatingAchievements[0]).toEqual(tournament.rotatingAchievements[0])
    expect(selectedLeague.defaultRotatingAchievements[0].sourceDefinitionId).toBe(definition.id)
  })
})

describe('catálogo de logros y penalizaciones de liga', () => {
  it('guarda un snapshot en el movimiento y editar el catálogo no altera la historia', () => {
    const definition = createLeagueAchievementDefinition(
      { name: 'Asistencia perfecta', description: 'Participó en todas las fechas.', points: 3 },
      ids,
      now,
    )
    const movements = registerSpecialPointMovement(
      [], 'league-a', 'player-a', definition.points, 'Registro mensual', ids, now,
      { sourceDefinitionId: definition.id, name: definition.name, description: definition.description },
    )
    const edited = updateLeagueAchievementDefinition(
      [definition], definition.id,
      { name: 'Asistencia actualizada', description: 'Nueva regla.', points: 5 },
      '2026-09-23T12:00:00.000Z',
    )
    expect(movements[0]).toMatchObject({
      sourceDefinitionId: definition.id,
      name: 'Asistencia perfecta',
      description: 'Participó en todas las fechas.',
      amount: 3,
    })
    expect(edited[0].points).toBe(5)
    expect(movements[0].amount).toBe(3)
  })

  it('reconstruye el catálogo de liga desde movimientos sin duplicar importaciones', () => {
    const movement = registerSpecialPointMovement(
      [], 'league-a', 'player-a', -2, '', ids, now,
      { name: 'Penalización administrativa', description: 'Ajuste de liga.' },
    )
    const once = buildLeagueAchievementCatalog(undefined, movement)
    const twice = buildLeagueAchievementCatalog(once, movement)
    expect(twice).toEqual(once)
    expect(once).toHaveLength(1)
    expect(once[0]).toMatchObject({ points: -2, active: false })
  })

  it('eliminar del catálogo de liga conserva movimientos históricos y no los reconstruye', () => {
    const definition = createLeagueAchievementDefinition({ name: 'Ajuste histórico', points: -2 }, ids, now)
    const movements = registerSpecialPointMovement(
      [], 'league-a', 'player-a', definition.points, '', ids, now,
      { sourceDefinitionId: definition.id, name: definition.name, description: definition.description },
    )
    const workspace = {
      ...createEmptyWorkspace(),
      leagueAchievementCatalog: deleteCatalogDefinition([definition], definition.id),
    }
    const restored = deserializeAppWorkspace(serializeAppWorkspace(workspace))!
    const ledger = {
      leaguePeriods: [], contributions: [], creditMovements: [],
      specialPointMovements: movements, championSnapshots: [],
    }
    expect(ensureWorkspaceAchievementCatalogs(restored, ledger).leagueAchievementCatalog).toEqual([])
    expect(movements[0]).toMatchObject({ sourceDefinitionId: definition.id, amount: -2, status: 'active' })
  })
})
