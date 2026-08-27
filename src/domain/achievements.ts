import { DomainError } from './errors'
import type {
  AchievementConfig,
  AchievementRule,
  PlayerResult,
  RotatingAchievementId,
  RotatingAchievementConfig,
  Tournament,
} from './tournament'

export const ROTATING_ACHIEVEMENT_IDS: RotatingAchievementId[] = [
  'rotating1',
  'rotating2',
  'rotating3',
  'rotating4',
  'rotating5',
]
export const MAX_ROTATING_ACHIEVEMENTS = ROTATING_ACHIEVEMENT_IDS.length
export const DEFAULT_ROTATING_ACHIEVEMENTS: RotatingAchievementConfig[] = [
  { id: 'rotating1', label: 'Primera sangre', points: 1 },
  { id: 'rotating2', label: 'Comandante al ataque', points: 1 },
  { id: 'rotating3', label: 'Pacto inesperado', points: 1 },
]

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
  const rules = Object.values(config).filter(
    (rule): rule is AchievementRule => Boolean(rule),
  )
  if (rules.some((rule) => !Number.isFinite(rule.points) || rule.points < 0)) {
    throw new DomainError('Los valores de logros deben ser números mayores o iguales a 0.')
  }
}

type AchievementResult = Pick<
  PlayerResult,
  | 'rotating1'
  | 'rotating2'
  | 'rotating3'
  | 'rotating4'
  | 'rotating5'
  | 'wonTable'
  | 'eliminations'
  | 'survived'
>

export function calculateAchievementPoints(
  result: AchievementResult,
  config: AchievementConfig = DEFAULT_ACHIEVEMENT_CONFIG,
): number {
  validateAchievementConfig(config)
  const rotatingPoints = ROTATING_ACHIEVEMENT_IDS.reduce((total, id) => {
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

function resultContainsFacts(result: PlayerResult): boolean {
  return (
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
    achievementPoints: calculateAchievementPoints(result, achievementConfig),
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
