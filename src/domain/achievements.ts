import { DomainError } from './errors'
import type {
  AchievementConfig,
  AchievementRule,
  LegacyRotatingAchievementConfig,
  PlayerResult,
  RotatingAchievementId,
  Tournament,
  TournamentRotatingAchievementSnapshot,
} from './tournament'
import {
  DEFAULT_ROTATING_ACHIEVEMENT_CATALOG,
  snapshotRotatingAchievement,
} from './achievementCatalogs'

export const ROTATING_ACHIEVEMENT_IDS: RotatingAchievementId[] = [
  'rotating1',
  'rotating2',
  'rotating3',
  'rotating4',
  'rotating5',
]
export const MAX_ROTATING_ACHIEVEMENTS = ROTATING_ACHIEVEMENT_IDS.length
export const DEFAULT_ROTATING_ACHIEVEMENTS: TournamentRotatingAchievementSnapshot[] =
  DEFAULT_ROTATING_ACHIEVEMENT_CATALOG.map((definition, index) => ({
    ...snapshotRotatingAchievement(definition),
    legacySlot: ROTATING_ACHIEVEMENT_IDS[index],
  }))

const enabledRule = (points: number): AchievementRule => ({ enabled: true, points })

export const DEFAULT_ACHIEVEMENT_CONFIG: AchievementConfig = {
  rotating1: enabledRule(1),
  rotating2: enabledRule(1),
  rotating3: enabledRule(1),
  win: enabledRule(3),
  elimination: enabledRule(1),
  survival: enabledRule(1),
}

export const LEGACY_ACHIEVEMENT_CONFIG: AchievementConfig = {
  ...DEFAULT_ACHIEVEMENT_CONFIG,
  rotating1: enabledRule(1),
  rotating2: enabledRule(1),
  rotating3: enabledRule(1),
  win: enabledRule(1),
}

export function cloneAchievementConfig(config: AchievementConfig): AchievementConfig {
  return {
    rotating1: { ...config.rotating1 },
    rotating2: { ...config.rotating2 },
    rotating3: { ...config.rotating3 },
    rotating4: config.rotating4 ? { ...config.rotating4 } : undefined,
    rotating5: config.rotating5 ? { ...config.rotating5 } : undefined,
    win: { ...config.win },
    elimination: { ...config.elimination },
    survival: { ...config.survival },
  }
}

export function validateAchievementConfig(config: AchievementConfig): void {
  const rules: AchievementRule[] = [config.win, config.elimination, config.survival]
  if (rules.some((rule) => !Number.isFinite(rule.points) || rule.points < 0)) {
    throw new DomainError('Los valores de logros deben ser números mayores o iguales a 0.')
  }
}

type AchievementResult = Pick<
  PlayerResult,
  | 'rotatingAchievementIds'
  | 'rotating1'
  | 'rotating2'
  | 'rotating3'
  | 'rotating4'
  | 'rotating5'
  | 'wonTable'
  | 'eliminations'
  | 'survived'
>

export function rotatingAchievementName(
  snapshot: TournamentRotatingAchievementSnapshot,
): string {
  return snapshot.name
}

function legacySlotValue(result: AchievementResult, slot: RotatingAchievementId): boolean {
  return Boolean(result[slot])
}

export function getObtainedRotatingAchievementIds(
  result: AchievementResult,
  snapshots: TournamentRotatingAchievementSnapshot[],
): string[] {
  const obtained = new Set(result.rotatingAchievementIds ?? [])
  snapshots.forEach((snapshot, index) => {
    const legacySlot = snapshot.legacySlot ?? (
      ROTATING_ACHIEVEMENT_IDS.includes(snapshot.id as RotatingAchievementId)
        ? snapshot.id as RotatingAchievementId
        : ROTATING_ACHIEVEMENT_IDS[index]
    )
    if (legacySlot && legacySlotValue(result, legacySlot)) obtained.add(snapshot.id)
  })
  return [...obtained]
}

export function normalizeRotatingAchievementSnapshots(
  achievements: Array<TournamentRotatingAchievementSnapshot | LegacyRotatingAchievementConfig> | undefined,
  config: AchievementConfig,
): TournamentRotatingAchievementSnapshot[] {
  const source = achievements?.length ? achievements : DEFAULT_ROTATING_ACHIEVEMENTS
  const seen = new Set<string>()
  return source.flatMap((achievement, index) => {
    const legacy = 'label' in achievement
    const legacySlot = legacy
      ? achievement.id
      : achievement.legacySlot ?? (
          ROTATING_ACHIEVEMENT_IDS.includes(achievement.id as RotatingAchievementId)
            ? achievement.id as RotatingAchievementId
            : undefined
        )
    const id = achievement.id || `legacy-rotating-${index + 1}`
    if (seen.has(id)) return []
    seen.add(id)
    const legacyRule = legacy && legacySlot ? config[legacySlot] : undefined
    return [{
      id,
      sourceDefinitionId: legacy ? undefined : achievement.sourceDefinitionId,
      name: legacy ? achievement.label.trim() : achievement.name.trim(),
      description: legacy ? '' : achievement.description ?? '',
      points: legacyRule?.points ?? achievement.points,
      enabled: legacyRule?.enabled ?? (legacy ? true : achievement.enabled),
      ...(legacySlot ? { legacySlot } : {}),
    }]
  })
}

export function migratePlayerResultRotatingAchievements(
  result: PlayerResult,
  snapshots: TournamentRotatingAchievementSnapshot[],
): PlayerResult {
  return {
    ...result,
    rotatingAchievementIds: getObtainedRotatingAchievementIds(result, snapshots),
    rotating1: result.rotating1 ?? false,
    rotating2: result.rotating2 ?? false,
    rotating3: result.rotating3 ?? false,
    rotating4: result.rotating4 ?? false,
    rotating5: result.rotating5 ?? false,
  }
}

export function calculateAchievementPoints(
  result: AchievementResult,
  config: AchievementConfig = DEFAULT_ACHIEVEMENT_CONFIG,
  snapshots?: TournamentRotatingAchievementSnapshot[],
): number {
  validateAchievementConfig(config)
  const rotatingPoints = snapshots
    ? getObtainedRotatingAchievementIds(result, snapshots).reduce((total, id) => {
        const snapshot = snapshots.find((item) => item.id === id)
        return total + (snapshot?.enabled ? snapshot.points : 0)
      }, 0)
    : ROTATING_ACHIEVEMENT_IDS.reduce((total, id) => {
        const rule = config[id]
        return total + (result[id] && rule?.enabled ? rule.points : 0)
      }, 0)
  return (
    rotatingPoints +
    (result.wonTable && config.win.enabled ? config.win.points : 0) +
    (config.elimination.enabled ? result.eliminations * config.elimination.points : 0) +
    (result.survived && config.survival.enabled ? config.survival.points : 0)
  )
}

/**
 * Cuenta exclusivamente los logros rotativos obtenidos y habilitados.
 * Victoria, eliminaciones y supervivencia aportan puntos según su configuración,
 * pero no forman parte de este criterio de desempate.
 */
export function calculateAchievementCount(
  result: AchievementResult,
  config: AchievementConfig = DEFAULT_ACHIEVEMENT_CONFIG,
  snapshots?: TournamentRotatingAchievementSnapshot[],
): number {
  validateAchievementConfig(config)
  if (snapshots) {
    const obtained = new Set(getObtainedRotatingAchievementIds(result, snapshots))
    return snapshots.filter(
      (snapshot) => snapshot.enabled && snapshot.points > 0 && obtained.has(snapshot.id),
    ).length
  }
  return ROTATING_ACHIEVEMENT_IDS.reduce((total, id) => {
    const rule = config[id]
    return total + (result[id] && rule?.enabled && rule.points > 0 ? 1 : 0)
  }, 0)
}

export function achievementPointConfigFromTournament(
  tournament: Tournament,
): AchievementConfig {
  return cloneAchievementConfig(tournament.achievementConfig)
}

export function achievementConfigsEqual(
  first: AchievementConfig,
  second: AchievementConfig,
): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

export function rotatingAchievementSnapshotsEqual(
  first: TournamentRotatingAchievementSnapshot[],
  second: TournamentRotatingAchievementSnapshot[],
): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

function resultContainsFacts(result: PlayerResult): boolean {
  return (
    Boolean(result.rotatingAchievementIds?.length) ||
    result.rotating1 ||
    result.rotating2 ||
    result.rotating3 ||
    result.rotating4 ||
    result.rotating5 ||
    result.wonTable ||
    result.eliminations > 0 ||
    result.survived ||
    result.specialLeaguePoints !== 0
  )
}

export function tournamentHasRecordedResults(tournament: Tournament): boolean {
  return tournament.rounds.some((round) =>
    round.tables.some(
      (table) =>
        table.status !== 'pending' ||
        table.savedResults.length > 0 ||
        table.results.some(resultContainsFacts),
    ),
  )
}

export function recalculateTournamentAchievementPoints(
  tournament: Tournament,
  achievementConfig: AchievementConfig,
): Tournament {
  validateAchievementConfig(achievementConfig)
  const recalculate = (result: PlayerResult): PlayerResult => ({
    ...result,
    achievementPoints: calculateAchievementPoints(
      result,
      achievementConfig,
      tournament.rotatingAchievements,
    ),
  })

  return {
    ...tournament,
    achievementConfig: cloneAchievementConfig(achievementConfig),
    rounds: tournament.rounds.map((round) => ({
      ...round,
      tables: round.tables.map((table) => ({
        ...table,
        results: table.results.map(recalculate),
        savedResults: table.savedResults.map(recalculate),
      })),
    })),
  }
}
