import { ROTATING_ACHIEVEMENT_IDS } from '../domain/achievements'
import type {
  AchievementConfig,
  AchievementRule,
  RotatingAchievementConfig,
  RotatingAchievementId,
} from '../domain/tournament'

interface AchievementConfigFieldsProps {
  value: AchievementConfig
  onChange: (value: AchievementConfig) => void
  rotatingAchievements?: RotatingAchievementConfig[]
}

const BASE_RULES: Array<{ key: 'win' | 'elimination' | 'survival'; label: string }> = [
  { key: 'win', label: 'Ganar la mesa' },
  { key: 'elimination', label: 'Eliminación' },
  { key: 'survival', label: 'Sobrevivir' },
]

export function AchievementConfigFields({
  value,
  onChange,
  rotatingAchievements,
}: AchievementConfigFieldsProps) {
  const rotatingKeys = (rotatingAchievements?.map((achievement) => achievement.id) ??
    ROTATING_ACHIEVEMENT_IDS.slice(0, 3)) as RotatingAchievementId[]
  const allRotatingEnabled = rotatingKeys.every((key) => value[key]?.enabled)
  const rules: Array<{ key: RotatingAchievementId | 'win' | 'elimination' | 'survival'; label: string }> = [
    ...rotatingKeys.map((key, index) => ({
      key,
      label: rotatingAchievements?.find((achievement) => achievement.id === key)?.label || `Rotativo ${index + 1}`,
    })),
    ...BASE_RULES,
  ]

  const updateRule = (
    key: RotatingAchievementId | 'win' | 'elimination' | 'survival',
    changes: Partial<AchievementRule>,
  ) => {
    onChange({ ...value, [key]: { enabled: true, points: 1, ...value[key], ...changes } })
  }

  return (
    <div className="achievement-config-fields">
      <label className="switch-field achievement-group-toggle">
        <input
          type="checkbox"
          checked={allRotatingEnabled}
          onChange={() => {
            const enabled = !allRotatingEnabled
            onChange(rotatingKeys.reduce<AchievementConfig>((config, key) => ({
              ...config,
              [key]: { points: 1, ...config[key], enabled },
            }), { ...value }))
          }}
        />
        <span>Usar logros rotativos</span>
      </label>

      <div className="achievement-rule-grid">
        {rules.map(({ key, label }) => {
          const rule = value[key] ?? { enabled: true, points: 1 }
          return (
          <div className={rule.enabled ? 'achievement-rule' : 'achievement-rule is-disabled'} key={key}>
            <label className="switch-field">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(event) => updateRule(key, { enabled: event.target.checked })}
              />
              <span>{label}</span>
            </label>
            <label className="field">
              <span>Puntos</span>
              <input
                type="number"
                min="0"
                step="1"
                value={rule.points}
                onChange={(event) => updateRule(key, { points: Number(event.target.value) })}
              />
            </label>
          </div>
        )})}
      </div>
      <p className="field-help">
        Desactivar un logro impide que otorgue puntos, pero conserva los hechos ya registrados.
      </p>
    </div>
  )
}
