import { describe, expect, it } from 'vitest'
import {
  calculateAchievementCount,
  calculateAchievementPoints,
  cloneAchievementConfig,
  DEFAULT_ACHIEVEMENT_CONFIG,
} from './achievements'

const recordedFacts = {
  rotating1: true,
  rotating2: false,
  rotating3: false,
  wonTable: true,
  eliminations: 2,
  survived: true,
}

describe('calculateAchievementPoints configurable', () => {
  it('usa por defecto win=3, rotativo=1, eliminación=1 y sobrevivir=1', () => {
    expect(DEFAULT_ACHIEVEMENT_CONFIG.win).toEqual({ enabled: true, points: 3 })
    expect(calculateAchievementPoints(recordedFacts)).toBe(7)
  })

  it('cuenta solamente los logros rotativos habilitados', () => {
    const result = {
      rotating1: true,
      rotating2: true,
      rotating3: true,
      wonTable: true,
      eliminations: 3,
      survived: true,
    }
    expect(calculateAchievementPoints(result)).toBe(10)
    expect(calculateAchievementCount(result)).toBe(3)
  })

  it('ignora victoria, eliminaciones y supervivencia sin depender de sus puntos', () => {
    const config = cloneAchievementConfig(DEFAULT_ACHIEVEMENT_CONFIG)
    config.win.points = 20
    config.rotating1.points = 0
    expect(calculateAchievementCount(recordedFacts, config)).toBe(1)
    expect(calculateAchievementPoints(recordedFacts, config)).toBe(23)
  })

  it('no cuenta un rotativo registrado cuando está deshabilitado', () => {
    const config = cloneAchievementConfig(DEFAULT_ACHIEVEMENT_CONFIG)
    config.rotating1.enabled = false
    expect(calculateAchievementCount(recordedFacts, config)).toBe(0)
    expect(recordedFacts.rotating1).toBe(true)
  })

  it('cambiar win de 3 a 5 recalcula sin cambiar los hechos', () => {
    const config = cloneAchievementConfig(DEFAULT_ACHIEVEMENT_CONFIG)
    config.win.points = 5
    expect(calculateAchievementPoints(recordedFacts, config)).toBe(9)
    expect(recordedFacts.wonTable).toBe(true)
  })

  it('deshabilitar y reactivar un rotativo excluye y recupera sus puntos sin borrar el hecho', () => {
    const disabled = cloneAchievementConfig(DEFAULT_ACHIEVEMENT_CONFIG)
    disabled.rotating1.enabled = false
    expect(calculateAchievementPoints(recordedFacts, disabled)).toBe(6)
    expect(recordedFacts.rotating1).toBe(true)

    disabled.rotating1.enabled = true
    expect(calculateAchievementPoints(recordedFacts, disabled)).toBe(7)
  })

  it('devuelve cero cuando no existen hechos registrados', () => {
    expect(calculateAchievementPoints({
      rotating1: false,
      rotating2: false,
      rotating3: false,
      wonTable: false,
      eliminations: 0,
      survived: false,
    })).toBe(0)
  })
})
