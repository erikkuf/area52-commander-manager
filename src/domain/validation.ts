import type { TournamentConfigInput } from './tournament'
import { DEFAULT_ACHIEVEMENT_CONFIG } from './achievements'
import { MAX_ROTATING_ACHIEVEMENTS } from './achievements'

export function validateTournamentConfig(input: TournamentConfigInput): string[] {
  const errors: string[] = []
  const prizeMode = input.prizeMode ?? 'manual_credit'

  if (!input.name.trim()) errors.push('El nombre del torneo es obligatorio.')
  if (!input.date) errors.push('La fecha es obligatoria.')
  if (!Number.isInteger(input.totalRounds) || input.totalRounds < 1) {
    errors.push('El número de rondas debe ser un entero mayor o igual a 1.')
  }
  if (
    input.pairingMode !== undefined &&
    !['balanced_random', 'swiss'].includes(input.pairingMode)
  ) {
    errors.push('Selecciona un sistema de emparejamiento válido.')
  }

  const rotatingAchievements = input.rotatingAchievements ?? [
    { id: 'rotating1' as const, label: input.rotating1, points: 1 },
    { id: 'rotating2' as const, label: input.rotating2, points: 1 },
    { id: 'rotating3' as const, label: input.rotating3, points: 1 },
  ]
  if (rotatingAchievements.length < 1 || rotatingAchievements.length > MAX_ROTATING_ACHIEVEMENTS) {
    errors.push(`Debes configurar entre 1 y ${MAX_ROTATING_ACHIEVEMENTS} logros rotativos.`)
  }
  if (rotatingAchievements.some((achievement) => !achievement.label.trim())) {
    errors.push('Todos los logros rotativos deben tener un nombre.')
  }
  if (new Set(rotatingAchievements.map((achievement) => achievement.id)).size !== rotatingAchievements.length) {
    errors.push('Los identificadores de logros rotativos no pueden repetirse.')
  }

  const achievementConfig = input.achievementConfig ?? DEFAULT_ACHIEVEMENT_CONFIG
  if (
    Object.values(achievementConfig).filter(Boolean).some(
      (rule) => !Number.isFinite(rule.points) || rule.points < 0,
    )
  ) {
    errors.push('Los valores de logros deben ser números mayores o iguales a 0.')
  }

  if (prizeMode === 'league_auto' && !input.leaguePeriodId) {
    errors.push('Selecciona un período para la fecha de liga.')
  }
  if (input.type === 'league_date' && prizeMode !== 'league_auto') {
    errors.push('Una fecha de liga debe usar pozos automáticos de liga.')
  }
  if (input.type === 'independent' && prizeMode === 'league_auto') {
    errors.push('Un torneo independiente no puede pertenecer a una liga.')
  }

  if (prizeMode === 'manual_credit') {
    if (!Number.isFinite(input.prizePool) || input.prizePool < 0) {
      errors.push('El pozo de crédito no puede ser negativo.')
    }
    if (input.percentagesByPosition.length === 0) {
      errors.push('Debes indicar al menos un porcentaje para distribuir el pozo.')
    }
    if (
      input.percentagesByPosition.some(
        (percentage) => !Number.isFinite(percentage) || percentage < 0,
      )
    ) {
      errors.push('Los porcentajes deben ser números iguales o mayores a 0.')
    }
    const percentageTotal = input.percentagesByPosition.reduce(
      (total, percentage) => total + percentage,
      0,
    )
    if (input.prizePool > 0 && Math.abs(percentageTotal - 100) > 0.001) {
      errors.push('Los porcentajes deben sumar 100 cuando existe un pozo activo.')
    }
  }

  return errors
}
