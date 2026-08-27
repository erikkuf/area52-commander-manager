import { useState, type FormEvent } from 'react'
import { AchievementConfigFields } from '../../components/AchievementConfigFields'
import { PrizePercentageEditor } from '../../components/PrizePercentageEditor'
import {
  cloneAchievementConfig,
  MAX_ROTATING_ACHIEVEMENTS,
  ROTATING_ACHIEVEMENT_IDS,
} from '../../domain/achievements'
import {
  calculateLeaguePoolSummary,
  rebalanceLeagueContribution,
  type LeagueContributionField,
} from '../../domain/prizes'
import type { LeaguePeriod, LeaguePoolContribution } from '../../domain/tournament'
import { formatCurrency } from '../../utils/format'

interface LeaguePeriodSettingsProps {
  leaguePeriod: LeaguePeriod
  contributions: LeaguePoolContribution[]
  error: string | null
  submitLabel?: string
  onUpdate: (leaguePeriod: LeaguePeriod) => void
}

export function LeaguePeriodSettings({
  leaguePeriod,
  contributions,
  error,
  submitLabel = 'Guardar configuración de liga',
  onUpdate,
}: LeaguePeriodSettingsProps) {
  const [draft, setDraft] = useState<LeaguePeriod>(() => ({
    ...leaguePeriod,
    contributionConfig: { ...leaguePeriod.contributionConfig },
    datePrizePercentages: [...leaguePeriod.datePrizePercentages],
    monthlyPrizePercentages: [...leaguePeriod.monthlyPrizePercentages],
    defaultAchievementConfig: cloneAchievementConfig(leaguePeriod.defaultAchievementConfig),
    defaultRotatingAchievements: leaguePeriod.defaultRotatingAchievements.map(
      (achievement) => ({ ...achievement }),
    ),
  }))
  const pools = calculateLeaguePoolSummary(contributions, leaguePeriod.id)
  const contributionTotal = draft.contributionConfig.contributionPerPlayer
  const dateShare = contributionTotal > 0
    ? (draft.contributionConfig.dateContributionPerPlayer / contributionTotal) * 100
    : 0

  const updateContribution = (field: LeagueContributionField, value: number) => {
    setDraft((current) => ({
      ...current,
      contributionConfig: rebalanceLeagueContribution(
        current.contributionConfig,
        field,
        value,
      ),
    }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onUpdate(draft)
  }

  return (
    <form className="league-settings-card" onSubmit={submit}>
      <div className="form-section__heading">
        <span>L</span>
        <div><h3>Configuración de liga</h3><p>{leaguePeriod.name}</p></div>
      </div>
      {leaguePeriod.status === 'finished' && (
        <div className="form-message form-message--error">
          Estás modificando una liga finalizada. Los cambios sensibles requieren confirmación y no reescriben fechas, créditos ni snapshots.
        </div>
      )}
      {error && <div className="form-message form-message--error">{error}</div>}

      <div className="form-grid">
        <label className="field field--wide">
          <span>Nombre de la liga</span>
          <input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label className="field">
          <span>Fecha inicio</span>
          <input required type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
        </label>
        <label className="field">
          <span>Fecha término</span>
          <input required type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} />
        </label>
      </div>

      <div className="league-settings-section">
        <h4>Aporte por jugador</h4>
        <div className="form-grid form-grid--three">
          {([
            ['contributionPerPlayer', 'Total'],
            ['dateContributionPerPlayer', 'Fecha'],
            ['monthlyContributionPerPlayer', 'Mensual'],
          ] as const).map(([field, label]) => (
            <label className="field" key={field}>
              <span>{label}</span>
              <input
                min="0"
                step="1"
                type="number"
                value={draft.contributionConfig[field]}
                onChange={(event) => updateContribution(field, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
        <div className="contribution-split-control">
          <div>
            <span>Distribución del aporte</span>
            <strong>{dateShare.toFixed(1)}% fecha · {(100 - dateShare).toFixed(1)}% mensual</strong>
          </div>
          <input
            aria-label="Distribución entre pozo de fecha y mensual"
            min="0"
            max={contributionTotal}
            step="1"
            type="range"
            value={draft.contributionConfig.dateContributionPerPlayer}
            onChange={(event) =>
              updateContribution('dateContributionPerPlayer', Number(event.target.value))
            }
          />
          <div className="contribution-split-control__amounts">
            <span>Fecha: {formatCurrency.format(draft.contributionConfig.dateContributionPerPlayer)}</span>
            <span>Mensual: {formatCurrency.format(draft.contributionConfig.monthlyContributionPerPlayer)}</span>
          </div>
        </div>
        <p className="field-help">Los valores se compensan automáticamente para que Fecha + Mensual siempre sea igual al Total.</p>
      </div>

      {([
        ['datePrizePercentages', 'Distribución del pozo de la fecha'],
        ['monthlyPrizePercentages', 'Distribución del pozo mensual'],
      ] as const).map(([field, title]) => (
        <div className="league-settings-section" key={field}>
          <PrizePercentageEditor
            title={title}
            value={draft[field]}
            onChange={(percentages) => setDraft((current) => ({
              ...current,
              [field]: percentages,
            }))}
          />
        </div>
      ))}

      <div className="league-settings-section">
        <h4>Configuración default de logros</h4>
        <p className="field-help">Se copiará solo a nuevas fechas. Las fechas existentes no cambian.</p>
        <div className="achievement-fields">
          {draft.defaultRotatingAchievements.map((achievement, index) => (
            <div className="rotating-achievement-row" key={achievement.id}>
              <label className="field">
                <span>Rotativo {index + 1}</span>
                <input value={achievement.label} onChange={(event) => setDraft((current) => ({
                  ...current,
                  defaultRotatingAchievements: current.defaultRotatingAchievements.map((item) =>
                    item.id === achievement.id ? { ...item, label: event.target.value } : item,
                  ),
                }))} />
              </label>
              {draft.defaultRotatingAchievements.length > 1 && (
                <button className="remove-position-button" type="button" onClick={() => setDraft((current) => ({
                  ...current,
                  defaultRotatingAchievements: current.defaultRotatingAchievements.filter((item) => item.id !== achievement.id),
                }))}>Quitar</button>
              )}
            </div>
          ))}
        </div>
        {draft.defaultRotatingAchievements.length < MAX_ROTATING_ACHIEVEMENTS && (
          <button className="text-button" type="button" onClick={() => setDraft((current) => {
            const used = new Set(current.defaultRotatingAchievements.map((achievement) => achievement.id))
            const nextId = ROTATING_ACHIEVEMENT_IDS.find((id) => !used.has(id))
            if (!nextId) return current
            return {
              ...current,
              defaultRotatingAchievements: [
                ...current.defaultRotatingAchievements,
                { id: nextId, label: `Logro rotativo ${current.defaultRotatingAchievements.length + 1}`, points: 1 },
              ],
              defaultAchievementConfig: {
                ...current.defaultAchievementConfig,
                [nextId]: { enabled: true, points: 1 },
              },
            }
          })}>+ Agregar logro rotativo</button>
        )}
        <AchievementConfigFields
          value={draft.defaultAchievementConfig}
          rotatingAchievements={draft.defaultRotatingAchievements}
          onChange={(defaultAchievementConfig) => setDraft({ ...draft, defaultAchievementConfig })}
        />
      </div>

      <div className="league-pool-totals">
        <div><span>Pozo mensual confirmado</span><strong>{formatCurrency.format(pools.monthlyFinalizedPool)}</strong></div>
        <div><span>Pozo mensual proyectado</span><strong>{formatCurrency.format(pools.monthlyProjectedPool)}</strong></div>
      </div>
      <div className="league-settings-actions">
        <small>{contributions.filter((item) => item.leaguePeriodId === leaguePeriod.id).length} fecha(s) aportando al período</small>
        <button className="primary-button" type="submit">{submitLabel}</button>
      </div>
    </form>
  )
}
