import { describe, expect, it } from 'vitest'
import { importParticipants } from '../domain/participants'
import { createTournament } from '../domain/tournamentOperations'
import { createEmptyWorkspace, ensureWorkspaceAchievementCatalogs, mergeLegacyTournament, upsertWorkspaceTournament } from '../domain/workspace'
import { registerSpecialPointMovement } from '../domain/specialPoints'
import {
  deserializeAppWorkspace,
  LocalStorageAppWorkspaceRepository,
  APP_WORKSPACE_STORAGE_VERSION,
  serializeAppWorkspace,
} from './localStorageAppWorkspaceRepository'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const historicalTournament = importParticipants(createTournament({
  name: 'Histórico',
  date: '2026-07-20',
  totalRounds: 1,
  rotating1: 'R1',
  rotating2: 'R2',
  rotating3: 'R3',
  type: 'independent',
  prizeMode: 'none',
  prizePool: 0,
  percentagesByPosition: [50, 30, 20],
}), 'Ana\nBeto\nCarla').tournament

describe('workspace e historial local', () => {
  it('conserva torneos históricos y la navegación tras serializar', () => {
    const workspace = {
      ...upsertWorkspaceTournament(createEmptyWorkspace(), { ...historicalTournament, status: 'finished' as const }),
      navigation: {
        ...createEmptyWorkspace().navigation,
        globalSection: 'events' as const,
        managerView: 'standing' as const,
      },
    }
    expect(deserializeAppWorkspace(serializeAppWorkspace(workspace))).toEqual(workspace)
  })

  it('migra el torneo actual antiguo al catálogo sin eliminarlo', () => {
    const migrated = mergeLegacyTournament(createEmptyWorkspace(), historicalTournament)
    expect(migrated.tournaments).toEqual([historicalTournament])
    expect(migrated.navigation.openedTournamentId).toBe(historicalTournament.id)
  })

  it('guarda y recupera el workspace mediante un repositorio desacoplado', async () => {
    const workspace = upsertWorkspaceTournament(createEmptyWorkspace(), historicalTournament)
    const repository = new LocalStorageAppWorkspaceRepository(new MemoryStorage())
    await repository.saveWorkspace(workspace)
    expect(await repository.getWorkspace()).toEqual(workspace)
  })

  it('aumenta schemaVersion y acepta el workspace anterior', () => {
    const workspace = upsertWorkspaceTournament(createEmptyWorkspace(), historicalTournament)
    const restored = deserializeAppWorkspace(JSON.stringify({ version: 5, workspace }))
    expect(APP_WORKSPACE_STORAGE_VERSION).toBe(8)
    expect(restored?.tournaments).toHaveLength(1)
    expect(restored?.rotatingAchievementCatalog.length).toBeGreaterThanOrEqual(3)
    expect(restored?.leagueAchievementCatalog).toEqual([])
    expect(restored?.tournamentPenaltyCatalog).toEqual([])
  })

  it('migra workspaces versión 7 sin catálogo de penalizaciones y conserva sus eventos', () => {
    const legacy = upsertWorkspaceTournament(createEmptyWorkspace(), historicalTournament)
    const serialized = JSON.stringify({
      version: 7,
      workspace: { ...legacy, tournamentPenaltyCatalog: undefined },
    })
    const restored = deserializeAppWorkspace(serialized)
    expect(restored?.tournaments[0].id).toBe(historicalTournament.id)
    expect(restored?.tournamentPenaltyCatalog).toEqual([])
  })

  it('reconstruye una vez el catálogo de liga antiguo desde movimientos y respeta una eliminación posterior', () => {
    const workspace = createEmptyWorkspace()
    const { leagueAchievementCatalog: _oldCatalog, ...oldWorkspace } = workspace
    const restored = deserializeAppWorkspace(JSON.stringify({ version: 6, workspace: oldWorkspace }))!
    const movements = registerSpecialPointMovement(
      [], 'league-1', 'player-a', 2, '', () => 'movement-1',
      '2026-09-22T12:00:00.000Z', { name: 'Actividad anónima', description: 'Motivo histórico' },
    )
    const ledger = {
      leaguePeriods: [], contributions: [], creditMovements: [],
      specialPointMovements: movements, championSnapshots: [],
    }
    const migrated = ensureWorkspaceAchievementCatalogs(restored, ledger)
    expect(migrated.leagueAchievementCatalog).toMatchObject([
      { name: 'Actividad anónima', points: 2, active: false },
    ])
    expect(ensureWorkspaceAchievementCatalogs({
      ...migrated, leagueAchievementCatalog: [],
    }, ledger).leagueAchievementCatalog).toEqual([])
  })

  it('reimportar un workspace legacy no duplica definiciones reconstruidas', () => {
    const workspace = upsertWorkspaceTournament(createEmptyWorkspace(), historicalTournament)
    const first = deserializeAppWorkspace(JSON.stringify({ version: 6, workspace }))!
    const second = deserializeAppWorkspace(serializeAppWorkspace(first))!
    expect(second.rotatingAchievementCatalog).toEqual(first.rotatingAchievementCatalog)
  })

  it('migra los nombres anteriores de navegación a Standing y Leaderboard', () => {
    const workspace = upsertWorkspaceTournament(createEmptyWorkspace(), historicalTournament)
    const restored = deserializeAppWorkspace(JSON.stringify({
      version: 2,
      workspace: {
        ...workspace,
        navigation: {
          ...workspace.navigation,
          managerView: 'leaderboard',
          leagueDetailTab: 'standings',
        },
      },
    }))
    expect(restored?.navigation.managerView).toBe('standing')
    expect(restored?.navigation.leagueDetailTab).toBe('leaderboard')
  })

  it('conserva Hall of Fame como sección global después de recargar', () => {
    const workspace = {
      ...createEmptyWorkspace(),
      navigation: {
        ...createEmptyWorkspace().navigation,
        globalSection: 'hall_of_fame' as const,
      },
    }
    expect(
      deserializeAppWorkspace(serializeAppWorkspace(workspace))?.navigation.globalSection,
    ).toBe('hall_of_fame')
  })
})
