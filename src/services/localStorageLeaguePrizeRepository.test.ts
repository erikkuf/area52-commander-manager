import { describe, expect, it } from 'vitest'
import { createDefaultLeaguePrizeLedger } from '../domain/prizes'
import {
  deserializeLeaguePrizeLedger,
  LocalStorageLeaguePrizeRepository,
  LEAGUE_PRIZE_STORAGE_VERSION,
  serializeLeaguePrizeLedger,
} from './localStorageLeaguePrizeRepository'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('persistencia de ligas y aportes', () => {
  it('serializa y recupera el ledger completo', () => {
    const ledger = createDefaultLeaguePrizeLedger(() => 'league-1', '2026-08-14T12:00:00.000Z')
    expect(deserializeLeaguePrizeLedger(serializeLeaguePrizeLedger(ledger))).toEqual(ledger)
  })

  it('guarda y recupera mediante el repositorio desacoplado', async () => {
    const ledger = createDefaultLeaguePrizeLedger(() => 'league-1', '2026-08-14T12:00:00.000Z')
    const repository = new LocalStorageLeaguePrizeRepository(new MemoryStorage())
    await repository.saveLedger(ledger)
    expect(await repository.getLedger()).toEqual(ledger)
  })

  it('migra el schema anterior sin borrar ligas ni aportes', () => {
    const ledger = createDefaultLeaguePrizeLedger(() => 'league-1', '2026-08-14T12:00:00.000Z')
    const legacy = JSON.parse(JSON.stringify(ledger))
    delete legacy.creditMovements
    delete legacy.specialPointMovements
    legacy.leaguePeriods.forEach((period: Record<string, unknown>) => {
      delete period.reviewRequired
      delete period.startDate
      delete period.endDate
      delete period.defaultAchievementConfig
      delete period.financialReviewRequired
      delete period.wasReopened
    })

    const restored = deserializeLeaguePrizeLedger(JSON.stringify({ version: 1, ledger: legacy }))
    expect(restored?.leaguePeriods).toHaveLength(1)
    expect(restored?.leaguePeriods[0].reviewRequired).toBe(false)
    expect(restored?.creditMovements).toEqual([])
    expect(restored?.specialPointMovements).toEqual([])
    expect(restored?.championSnapshots).toEqual([])
    expect(restored?.leaguePeriods[0].defaultAchievementConfig.win.points).toBe(3)
    expect(restored?.leaguePeriods[0].startDate).toBe('2026-08-14')
    expect(restored?.leaguePeriods[0]).toMatchObject({ financialReviewRequired: false, wasReopened: false })
    expect(LEAGUE_PRIZE_STORAGE_VERSION).toBe(7)
  })

  it('migra versión 4 conservando premios y revisión financiera', () => {
    const ledger = createDefaultLeaguePrizeLedger(() => 'league-1', '2026-08-14T12:00:00.000Z')
    ledger.leaguePeriods[0] = {
      ...ledger.leaguePeriods[0],
      status: 'finished',
      finalizedMonthlyAwards: [{ playerKey: 'player-1', position: 1, amount: 10000 }],
      financialReviewRequired: true,
    }
    const restored = deserializeLeaguePrizeLedger(JSON.stringify({ version: 4, ledger }))
    expect(restored?.leaguePeriods[0].finalizedMonthlyAwards).toEqual(
      ledger.leaguePeriods[0].finalizedMonthlyAwards,
    )
    expect(restored?.leaguePeriods[0].financialReviewRequired).toBe(true)
  })

  it('persiste snapshots y referencias de foto sin incluir el archivo binario', () => {
    const ledger = createDefaultLeaguePrizeLedger(() => 'league-1', '2026-08-14T12:00:00.000Z')
    ledger.championSnapshots = [{
      id: 'snapshot-1',
      leaguePeriodId: ledger.leaguePeriods[0].id,
      leagueName: 'Liga Agosto',
      playerKey: 'player-1',
      playerName: 'Ana',
      finalPosition: 1,
      leaguePoints: 20,
      achievementPoints: 18,
      specialLeaguePoints: 2,
      tableWins: 4,
      eliminations: 7,
      tournamentsPlayed: 3,
      championPhoto: {
        id: 'photo-1',
        fileName: 'ana.webp',
        mimeType: 'image/webp',
        storageKey: 'champion-photo:snapshot-1',
      },
      createdAt: '2026-08-31T23:00:00.000Z',
    }]
    const serialized = serializeLeaguePrizeLedger(ledger)
    expect(serialized).not.toContain('data:image')
    expect(deserializeLeaguePrizeLedger(serialized)?.championSnapshots).toEqual(
      ledger.championSnapshots,
    )
  })
})
