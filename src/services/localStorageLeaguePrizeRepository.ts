import type { LeaguePrizeLedger } from '../domain/tournament'
import {
  cloneAchievementConfig,
  DEFAULT_ACHIEVEMENT_CONFIG,
  DEFAULT_ROTATING_ACHIEVEMENTS,
} from '../domain/achievements'
import type { LeaguePrizeRepository } from './leaguePrizeRepository'

export const LEAGUE_PRIZE_STORAGE_KEY = 'area52.commander-manager.league-prizes'
export const LEAGUE_PRIZE_STORAGE_VERSION = 7

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function isLeaguePrizeLedger(value: unknown): value is LeaguePrizeLedger {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LeaguePrizeLedger>
  return Array.isArray(candidate.leaguePeriods) && Array.isArray(candidate.contributions)
}

export function serializeLeaguePrizeLedger(ledger: LeaguePrizeLedger): string {
  return JSON.stringify({ version: LEAGUE_PRIZE_STORAGE_VERSION, ledger })
}

export function deserializeLeaguePrizeLedger(serialized: string): LeaguePrizeLedger | null {
  try {
    const snapshot = JSON.parse(serialized) as { version?: number; ledger?: unknown }
    if (![1, 2, 3, 4, 5, 6, LEAGUE_PRIZE_STORAGE_VERSION].includes(snapshot.version ?? -1) || !isLeaguePrizeLedger(snapshot.ledger)) {
      return null
    }
    return {
      ...snapshot.ledger,
      creditMovements: snapshot.ledger.creditMovements ?? [],
      specialPointMovements: snapshot.ledger.specialPointMovements ?? [],
      championSnapshots: snapshot.ledger.championSnapshots ?? [],
      leaguePeriods: snapshot.ledger.leaguePeriods.map((period) => ({
        ...period,
        startDate: period.startDate ?? period.createdAt.slice(0, 10),
        endDate: period.endDate ?? (period.finishedAt ?? period.updatedAt).slice(0, 10),
        defaultAchievementConfig: period.defaultAchievementConfig
          ? cloneAchievementConfig(period.defaultAchievementConfig)
          : cloneAchievementConfig(DEFAULT_ACHIEVEMENT_CONFIG),
        defaultRotatingAchievements: period.defaultRotatingAchievements?.length
          ? period.defaultRotatingAchievements.slice(0, 5).map((achievement) => ({ ...achievement }))
          : DEFAULT_ROTATING_ACHIEVEMENTS.map((achievement) => ({ ...achievement })),
        reviewRequired: period.reviewRequired ?? false,
        financialReviewRequired:
          period.financialReviewRequired ?? period.reviewRequired ?? false,
        wasReopened: period.wasReopened ?? false,
      })),
    }
  } catch {
    return null
  }
}

export class LocalStorageLeaguePrizeRepository implements LeaguePrizeRepository {
  constructor(
    private readonly storage: StorageLike,
    private readonly storageKey = LEAGUE_PRIZE_STORAGE_KEY,
  ) {}

  async getLedger(): Promise<LeaguePrizeLedger | null> {
    const serialized = this.storage.getItem(this.storageKey)
    return serialized ? deserializeLeaguePrizeLedger(serialized) : null
  }

  async saveLedger(ledger: LeaguePrizeLedger): Promise<void> {
    this.storage.setItem(this.storageKey, serializeLeaguePrizeLedger(ledger))
  }
}

export function createBrowserLeaguePrizeRepository(): LeaguePrizeRepository {
  return new LocalStorageLeaguePrizeRepository(window.localStorage)
}
