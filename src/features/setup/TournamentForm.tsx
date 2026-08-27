import { useState, type FormEvent } from 'react'
import { AchievementConfigFields } from '../../components/AchievementConfigFields'
import { PrizePercentageEditor } from '../../components/PrizePercentageEditor'
import {
  cloneAchievementConfig,
  DEFAULT_ACHIEVEMENT_CONFIG,
  MAX_ROTATING_ACHIEVEMENTS,
  ROTATING_ACHIEVEMENT_IDS,
} from '../../domain/achievements'
import type {
  LeaguePeriod,
  RotatingAchievementConfig,
  TournamentConfigInput,
} from '../../domain/tournament'
import { formatCurrency } from '../../utils/format'
import {
  PAIRING_MODE_DESCRIPTIONS,
  PAIRING_MODE_LABELS,
} from '../../domain/pairing'
import { defaultTournamentConfig } from './tournamentFormDefaults'

interface TournamentFormProps {
  initialValue?: TournamentConfigInput
  leaguePeriods: LeaguePeriod[]
  prizePlayerCount?: number
  submitLabel: string
  error?: string | null
  allowEventTypeChange?: boolean
  inheritLeagueDefaults?: boolean
  onSubmit: (value: TournamentConfigInput) => void
}

export function TournamentForm({
  initialValue = defaultTournamentConfig,
  leaguePeriods,
  prizePlayerCount = 0,
  submitLabel,
  error,
  allowEventTypeChange = true,
  inheritLeagueDefaults = true,
  onSubmit,
}: TournamentFormProps) {
  const [form, setForm] = useState<TournamentConfigInput>(() => ({
    ...initialValue,
    percentagesByPosition: [...initialValue.percentagesByPosition],
    rotatingAchievements: (
      initialValue.rotatingAchievements ?? [
        { id: 'rotating1', label: initialValue.rotating1, points: 1 },
        { id: 'rotating2', label: initialValue.rotating2, points: 1 },
        { id: 'rotating3', label: initialValue.rotating3, points: 1 },
      ]
    ).map((achievement) => ({ ...achievement })),
    achievementConfig: cloneAchievementConfig(
      initialValue.achievementConfig ?? DEFAULT_ACHIEVEMENT_CONFIG,
    ),
    prizeMode: initialValue.prizeMode ?? 'manual_credit',
    pairingMode: initialValue.pairingMode ?? 'balanced_random',
    leaguePeriodId: initialValue.leaguePeriodId ?? leaguePeriods[0]?.id,
  }))
  const isLeague = form.prizeMode === 'league_auto'
  const selectedLeague = leaguePeriods.find((period) => period.id === form.leaguePeriodId)

  const updateRotatingAchievements = (rotatingAchievements: RotatingAchievementConfig[]) => {
    setForm((current) => ({
      ...current,
      rotatingAchievements,
      rotating1: rotatingAchievements[0]?.label ?? '',
      rotating2: rotatingAchievements[1]?.label ?? '',
      rotating3: rotatingAchievements[2]?.label ?? '',
      achievementConfig: {
        ...(current.achievementConfig ?? DEFAULT_ACHIEVEMENT_CONFIG),
        ...Object.fromEntries(rotatingAchievements.map((achievement) => [
          achievement.id,
          current.achievementConfig?.[achievement.id] ?? { enabled: true, points: 1 },
        ])),
      },
    }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit(form)
  }

  const config = selectedLeague?.contributionConfig
  const datePool = prizePlayerCount * (config?.dateContributionPerPlayer ?? 0)
  const monthlyPool = prizePlayerCount * (config?.monthlyContributionPerPlayer ?? 0)

  return (
    <form className="tournament-form" onSubmit={handleSubmit}>
      {error && <div className="form-message form-message--error">{error}</div>}

      <div className="form-section">
        <div className="form-section__heading">
          <span>01</span>
          <div>
            <h3>Datos generales</h3>
            <p>Identidad, estructura y tipo de evento.</p>
          </div>
        </div>
        <div className="event-type-field">
          <span>Tipo de evento</span>
          <div className="choice-buttons" role="group" aria-label="Tipo de evento">
            <button
              type="button"
              className={isLeague ? 'is-selected' : ''}
              aria-pressed={isLeague}
              disabled={!allowEventTypeChange}
              onClick={() => setForm((current) => {
                const leaguePeriodId = current.leaguePeriodId ?? leaguePeriods[0]?.id
                const league = leaguePeriods.find((period) => period.id === leaguePeriodId)
                return {
                  ...current,
                  type: 'league_date',
                  prizeMode: 'league_auto',
                  leaguePeriodId,
                  achievementConfig:
                    inheritLeagueDefaults && league
                      ? cloneAchievementConfig(league.defaultAchievementConfig)
                      : current.achievementConfig,
                  rotatingAchievements:
                    inheritLeagueDefaults && league
                      ? league.defaultRotatingAchievements.map((achievement) => ({ ...achievement }))
                      : current.rotatingAchievements,
                }
              })}
            >
              Fecha de Liga
            </button>
            <button
              type="button"
              className={!isLeague ? 'is-selected' : ''}
              aria-pressed={!isLeague}
              disabled={!allowEventTypeChange}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  type: 'independent',
                  prizeMode: current.prizeMode === 'manual_credit' ? 'manual_credit' : 'none',
                  leaguePeriodId: undefined,
                }))
              }
            >
              Torneo Independiente
            </button>
          </div>
        </div>
        <div className="form-grid">
          <label className="field field--wide">
            <span>Nombre del torneo o fecha</span>
            <input
              required
              type="text"
              value={form.name}
              placeholder="Ej. Liga Commander Agosto · Fecha 3"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Fecha</span>
            <input
              required
              type="date"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Número total de rondas</span>
            <input
              required
              min="1"
              max="12"
              type="number"
              value={form.totalRounds}
              onChange={(event) => setForm({ ...form, totalRounds: Number(event.target.value) })}
            />
          </label>
        </div>
        <div className="event-type-field pairing-mode-field">
          <span>Sistema de emparejamiento</span>
          <div className="choice-buttons" role="group" aria-label="Sistema de emparejamiento">
            {(['balanced_random', 'swiss'] as const).map((pairingMode) => (
              <button
                type="button"
                key={pairingMode}
                className={form.pairingMode === pairingMode ? 'is-selected' : ''}
                aria-pressed={form.pairingMode === pairingMode}
                onClick={() => setForm((current) => ({ ...current, pairingMode }))}
              >
                {PAIRING_MODE_LABELS[pairingMode]}
              </button>
            ))}
          </div>
          <p className="field-help">
            {PAIRING_MODE_DESCRIPTIONS[form.pairingMode ?? 'balanced_random']}
          </p>
        </div>
      </div>

      <div className="setup-columns">
        <div className="form-section">
          <div className="form-section__heading">
            <span>02</span>
            <div>
              <h3>Logros y puntajes</h3>
              <p>Define qué logros se usan y cuánto vale cada uno.</p>
            </div>
          </div>
          <div className="achievement-fields">
            {(form.rotatingAchievements ?? []).map((achievement, index) => (
              <div className="rotating-achievement-row" key={achievement.id}>
              <label className="field">
                <span>Rotativo {index + 1}</span>
                <input
                  required
                  type="text"
                  value={achievement.label}
                  onChange={(event) => updateRotatingAchievements(
                    (form.rotatingAchievements ?? []).map((item) =>
                      item.id === achievement.id ? { ...item, label: event.target.value } : item,
                    ),
                  )}
                />
              </label>
              {(form.rotatingAchievements?.length ?? 0) > 1 && (
                <button className="remove-position-button" type="button" onClick={() =>
                  updateRotatingAchievements((form.rotatingAchievements ?? []).filter((item) => item.id !== achievement.id))
                }>Quitar</button>
              )}
              </div>
            ))}
          </div>
          {(form.rotatingAchievements?.length ?? 0) < MAX_ROTATING_ACHIEVEMENTS && (
            <button className="text-button" type="button" onClick={() => {
              const used = new Set((form.rotatingAchievements ?? []).map((achievement) => achievement.id))
              const nextId = ROTATING_ACHIEVEMENT_IDS.find((id) => !used.has(id))
              if (nextId) updateRotatingAchievements([
                ...(form.rotatingAchievements ?? []),
                { id: nextId, label: `Logro rotativo ${(form.rotatingAchievements?.length ?? 0) + 1}`, points: 1 },
              ])
            }}>+ Agregar logro rotativo</button>
          )}
          <p className="field-help">Puedes usar entre 1 y {MAX_ROTATING_ACHIEVEMENTS} logros rotativos.</p>
          <AchievementConfigFields
            value={form.achievementConfig ?? DEFAULT_ACHIEVEMENT_CONFIG}
            rotatingAchievements={form.rotatingAchievements}
            onChange={(achievementConfig) => setForm((current) => ({ ...current, achievementConfig }))}
          />
        </div>

        <div className="form-section">
          <div className="form-section__heading">
            <span>03</span>
            <div>
              <h3>Pozos</h3>
              <p>{isLeague ? 'Derivados de la configuración de liga.' : 'Configuración del torneo independiente.'}</p>
            </div>
          </div>

          {isLeague ? (
            <div className="league-prize-config">
              <label className="field">
                <span>Liga</span>
                <select
                  required
                  disabled={!allowEventTypeChange}
                  value={form.leaguePeriodId ?? ''}
                  onChange={(event) => {
                    const leaguePeriodId = event.target.value
                    const league = leaguePeriods.find((period) => period.id === leaguePeriodId)
                    setForm({
                      ...form,
                      leaguePeriodId,
                      achievementConfig:
                        inheritLeagueDefaults && league
                          ? cloneAchievementConfig(league.defaultAchievementConfig)
                          : form.achievementConfig,
                      rotatingAchievements:
                        inheritLeagueDefaults && league
                          ? league.defaultRotatingAchievements.map((achievement) => ({ ...achievement }))
                          : form.rotatingAchievements,
                    })
                  }}
                >
                  <option value="">Seleccionar liga…</option>
                  {leaguePeriods.filter((period) => period.status === 'active').map((period) => (
                    <option key={period.id} value={period.id}>{period.name}</option>
                  ))}
                </select>
              </label>
              {selectedLeague && config && (
                <>
                  <div className="contribution-summary">
                    <div><span>Aporte por jugador</span><strong>{formatCurrency.format(config.contributionPerPlayer)}</strong></div>
                    <div><span>Pozo fecha por jugador</span><strong>{formatCurrency.format(config.dateContributionPerPlayer)}</strong></div>
                    <div><span>Pozo mensual por jugador</span><strong>{formatCurrency.format(config.monthlyContributionPerPlayer)}</strong></div>
                  </div>
                  <div className="live-pool-summary" aria-live="polite">
                    <div><span>Jugadores</span><strong>{prizePlayerCount}</strong></div>
                    <div><span>Pozo de esta fecha</span><strong>{formatCurrency.format(datePool)}</strong></div>
                    <div><span>Aporte al pozo mensual</span><strong>{formatCurrency.format(monthlyPool)}</strong></div>
                    <div><span>Total generado</span><strong>{formatCurrency.format(datePool + monthlyPool)}</strong></div>
                  </div>
                  <p className="readonly-prize-note">Estos pozos se calculan automáticamente y no se pueden editar.</p>
                </>
              )}
            </div>
          ) : (
            <div className="independent-prize-config">
              <span>Pozo</span>
              <div className="choice-buttons choice-buttons--compact" role="group" aria-label="Pozo del torneo independiente">
                <button
                  type="button"
                  className={form.prizeMode === 'none' ? 'is-selected' : ''}
                  aria-pressed={form.prizeMode === 'none'}
                  onClick={() => setForm({ ...form, prizeMode: 'none' })}
                >
                  Sin crédito
                </button>
                <button
                  type="button"
                  className={form.prizeMode === 'manual_credit' ? 'is-selected' : ''}
                  aria-pressed={form.prizeMode === 'manual_credit'}
                  onClick={() => setForm({ ...form, prizeMode: 'manual_credit' })}
                >
                  Crédito de tienda
                </button>
              </div>
              {form.prizeMode === 'none' ? (
                <div className="no-credit-note">Este torneo no generará crédito por posición.</div>
              ) : (
                <>
                  <label className="field">
                    <span>Pozo de crédito manual</span>
                    <input
                      required
                      min="0"
                      step="100"
                      type="number"
                      value={form.prizePool}
                      onChange={(event) => setForm({ ...form, prizePool: Number(event.target.value) })}
                    />
                  </label>
                  <PrizePercentageEditor
                    value={form.percentagesByPosition}
                    onChange={(percentagesByPosition) => setForm((current) => ({
                      ...current,
                      percentagesByPosition,
                    }))}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="form-submit-row">
        <p>Los cambios posteriores con resultados requieren confirmación y recálculo explícito.</p>
        <button className="primary-button" type="submit">{submitLabel}</button>
      </div>
    </form>
  )
}
