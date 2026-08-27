import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import {
  calculateAchievementPoints,
  cloneAchievementConfig,
  DEFAULT_ACHIEVEMENT_CONFIG,
  DEFAULT_ROTATING_ACHIEVEMENTS,
} from './achievements'
import {
  buildCreditUsageImportPreview,
  importCreditUsageMovements,
} from './creditImport'
import { findExactLeagueTieGroups, haveEqualLeagueTieBreakers } from './league'
import { buildPlayerRegistry, mergePlayerIdentities, resolveRegisteredPlayerKey } from './playerRegistry'
import { createDefaultLeaguePrizeLedger } from './prizes'
import { createEmptyWorkspace } from './workspace'
import type { LeagueLeaderboardEntry } from './league'
import type { Tournament } from './tournament'
import { parseXlsx } from '../services/xlsxReader'
import {
  APP_STATE_STORAGE_VERSION,
  deserializeAppState,
  LocalStorageAppStateRepository,
  serializeAppState,
} from '../services/localStorageAppStateRepository'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('logros rotativos ampliables', () => {
  it('admite hasta cinco hechos rotativos sin alterar los tres históricos', () => {
    const config = cloneAchievementConfig(DEFAULT_ACHIEVEMENT_CONFIG)
    config.rotating4 = { enabled: true, points: 2 }
    config.rotating5 = { enabled: false, points: 5 }
    expect(calculateAchievementPoints({
      rotating1: true,
      rotating2: false,
      rotating3: false,
      rotating4: true,
      rotating5: true,
      wonTable: false,
      eliminations: 0,
      survived: false,
    }, config)).toBe(3)
    expect(DEFAULT_ROTATING_ACHIEVEMENTS).toHaveLength(3)
  })
})

describe('persistencia transaccional', () => {
  it('guarda workspace y ledger en una sola instantánea versionada', async () => {
    const storage = new MemoryStorage()
    const repository = new LocalStorageAppStateRepository(storage)
    const state = {
      workspace: createEmptyWorkspace(),
      ledger: createDefaultLeaguePrizeLedger(() => 'league-1', '2026-08-19T12:00:00.000Z'),
    }
    await repository.saveState(state)
    expect(storage.values).toHaveLength(1)
    expect(await repository.getState()).toEqual(state)
    expect(JSON.parse(serializeAppState(state)).version).toBe(APP_STATE_STORAGE_VERSION)
    expect(deserializeAppState('{"version":99}')).toBeNull()
  })
})

describe('registro estable de jugadores', () => {
  const tournament = (id: string, playerKey: string, name: string): Tournament => ({
    id,
    type: 'independent',
    name: id,
    date: '2026-08-19',
    totalRounds: 1,
    pairingMode: 'balanced_random',
    currentRound: 0,
    status: 'setup',
    prizeMode: 'none',
    prizePlayerCount: 0,
    prizeParticipantIds: [],
    rotatingAchievements: DEFAULT_ROTATING_ACHIEVEMENTS,
    achievementConfig: DEFAULT_ACHIEVEMENT_CONFIG,
    dateCreditConfig: { prizePool: 0, percentagesByPosition: [] },
    participants: [{ id: `${id}-p`, playerKey, name, active: true, isGhost: false }],
    rounds: [],
    ghostPairingAuthorized: false,
    financialReviewRequired: false,
    createdAt: '2026-08-19T12:00:00.000Z',
    updatedAt: '2026-08-19T12:00:00.000Z',
  })

  it('conserva alias y actualiza resultados/movimientos al unificar', () => {
    const tournaments = [
      tournament('july', 'player:ruben', 'Ruben Muñoz'),
      tournament('august', 'player:ruben-short', 'Ruben Mu'),
    ]
    const registry = buildPlayerRegistry(tournaments, [], '2026-08-19T12:00:00.000Z')
    const ledger = {
      ...createDefaultLeaguePrizeLedger(() => 'league', '2026-08-19T12:00:00.000Z'),
      creditMovements: [{
        id: 'movement', playerKey: 'player:ruben-short', type: 'usage' as const,
        amount: 1000, reason: 'Uso', createdAt: '2026-08-19T12:00:00.000Z', status: 'active' as const,
      }],
    }
    const merged = mergePlayerIdentities(
      tournaments, ledger, registry, 'player:ruben-short', 'player:ruben', 'Ruben Muñoz',
    )
    expect(merged.registry).toHaveLength(1)
    expect(merged.registry[0].aliases).toEqual(expect.arrayContaining(['Ruben Muñoz', 'Ruben Mu']))
    expect(merged.ledger.creditMovements[0].playerKey).toBe('player:ruben')
    expect(resolveRegisteredPlayerKey(merged.registry, 'Ruben Mu')).toBe('player:ruben')
  })
})

describe('desempate administrativo exacto', () => {
  const entry = (playerKey: string, name: string, points = 10): LeagueLeaderboardEntry => ({
    playerKey,
    playerName: name,
    position: 1,
    leaguePoints: points,
    achievementPoints: 8,
    specialLeaguePoints: 0,
    participations: 2,
    dateCreditEarned: 0,
    theoreticalDateCredit: 0,
    dateCreditDifference: 0,
    monthlyPrize: 0,
    monthlyPrizeStatus: 'projected',
    totalCredit: 0,
    totalCreditStatus: 'projected',
    tableWins: 2,
    eliminations: 3,
  })
  it('solo agrupa empates que agotaron victorias, logros y eliminaciones', () => {
    const ana = entry('ana', 'Ana')
    const beto = entry('beto', 'Beto')
    const carla = entry('carla', 'Carla', 9)
    expect(haveEqualLeagueTieBreakers(ana, beto)).toBe(true)
    expect(findExactLeagueTieGroups([ana, beto, carla])).toEqual([[ana, beto]])
  })
})

describe('importación guiada de crédito desde Excel', () => {
  const workbookBytes = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Leaderboard" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>Jugador</t></si><si><t>Crédito Usado</t></si><si><t>Ruben Mu</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>3200</v></c></row></sheetData></worksheet>'),
  })

  it('lee xlsx, resuelve alias y evita importar dos veces la misma fila', () => {
    const sheets = parseXlsx(workbookBytes.buffer.slice(
      workbookBytes.byteOffset,
      workbookBytes.byteOffset + workbookBytes.byteLength,
    ) as ArrayBuffer)
    const registry = [{
      playerKey: 'player:ruben',
      canonicalName: 'Ruben Muñoz',
      aliases: ['Ruben Mu'],
      createdAt: '2026-08-19T12:00:00.000Z',
      updatedAt: '2026-08-19T12:00:00.000Z',
    }]
    const startingMovements = [{
      id: 'prize-ruben',
      playerKey: 'player:ruben',
      leaguePeriodId: 'league-july',
      type: 'date_prize' as const,
      amount: 5000,
      reason: 'Pozo fecha',
      createdAt: '2026-08-19T12:00:00.000Z',
      status: 'active' as const,
    }]
    const preview = buildCreditUsageImportPreview(sheets, 'Julio.xlsx', 'league-july', registry, startingMovements)
    expect(preview.rows[0]).toMatchObject({ playerKey: 'player:ruben', amount: 3200, status: 'ready' })
    const once = importCreditUsageMovements(startingMovements, preview, 'league-july')
    const duplicatePreview = buildCreditUsageImportPreview(sheets, 'Julio.xlsx', 'league-july', registry, once)
    expect(duplicatePreview.rows[0].status).toBe('duplicate')
    expect(importCreditUsageMovements(once, duplicatePreview, 'league-july')).toEqual(once)
  })

  it('reconoce un uso antiguo equivalente aunque no tenga sourceReference', () => {
    const registry = [{ playerKey: 'player:ruben', canonicalName: 'Ruben Mu', aliases: [], createdAt: '', updatedAt: '' }]
    const sheets = [{ name: 'Leaderboard', rows: [['Jugador', 'Crédito Usado'], ['Ruben Mu', 3200]] }]
    const movements = [
      { id: 'prize', playerKey: 'player:ruben', leaguePeriodId: 'league-july', type: 'date_prize' as const, amount: 5000, reason: 'Pozo', createdAt: '', status: 'active' as const },
      { id: 'legacy-usage', playerKey: 'player:ruben', leaguePeriodId: 'league-july', type: 'usage' as const, amount: 3200, reason: 'Uso antiguo', createdAt: '', status: 'active' as const },
    ]
    expect(buildCreditUsageImportPreview(sheets, 'Julio.xlsx', 'league-july', registry, movements).rows[0].status).toBe('duplicate')
  })
})
