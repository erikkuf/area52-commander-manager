import type {
  AchievementConfig,
  AchievementRule,
  TournamentRotatingAchievementSnapshot,
} from '../domain/tournament'

interface AchievementConfigFieldsProps {
  value: AchievementConfig
  onChange: (value: AchievementConfig) => void
  rotatingAchievements?: TournamentRotatingAchievementSnapshot[]
}

const BASE_RULES: Array<{ key: 'win' | 'elimination' | 'survival'; label: string }> = [
  { key: 'win', label: 'Ganar la mesa' },
  { key: 'elimination', label: 'Eliminación' },
  { key: 'survival', label: 'Sobrevivir' },
]

export function AchievementConfigFields({
  value,
  onChange,
}: AchievementConfigFieldsProps) {
  const rules = BASE_RULES

  const updateRule = (
    key: 'win' | 'elimination' | 'survival',
    changes: Partial<AchievementRule>,
  ) => {
    onChange({ ...value, [key]: { ...(value[key] ?? { enabled: true, points: 1 }), ...changes } })
  }

  return (
    <div className="achievement-config-fields">
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
        Estas reglas fijas son independientes del catálogo de logros rotativos.
      </p>
    </div>
  )
}
