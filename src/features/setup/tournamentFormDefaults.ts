import {
  cloneAchievementConfig,
  DEFAULT_ACHIEVEMENT_CONFIG,
  DEFAULT_ROTATING_ACHIEVEMENTS,
} from '../../domain/achievements'
import type { TournamentConfigInput } from '../../domain/tournament'

export const defaultTournamentConfig: TournamentConfigInput = {
  name: '',
  date: new Date().toISOString().slice(0, 10),
  totalRounds: 3,
  pairingMode: 'balanced_random',
  rotating1: 'Primera sangre',
  rotating2: 'Comandante al ataque',
  rotating3: 'Pacto inesperado',
  rotatingAchievements: DEFAULT_ROTATING_ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
  })),
  prizePool: 40000,
  percentagesByPosition: [50, 30, 20],
  prizeMode: 'league_auto',
  achievementConfig: cloneAchievementConfig(DEFAULT_ACHIEVEMENT_CONFIG),
}
