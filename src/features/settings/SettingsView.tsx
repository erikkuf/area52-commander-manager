import { useState } from 'react'
import { CloseIcon } from '../../components/icons'
import {
  achievementConfigsEqual,
  tournamentHasRecordedResults,
} from '../../domain/achievements'
import { calculateTournamentPrizeSummary } from '../../domain/prizes'
import type {
  LeaguePeriod,
  LeaguePoolContribution,
  Tournament,
  TournamentConfigInput,
} from '../../domain/tournament'
import {
  assessRoundReduction,
  type TournamentConfigurationUpdateOptions,
} from '../../domain/tournamentOperations'
import { formatCurrency } from '../../utils/format'
import { TournamentForm } from '../setup/TournamentForm'
import { PAIRING_MODE_LABELS } from '../../domain/pairing'

interface SettingsViewProps {
  tournament: Tournament
  leaguePeriods: LeaguePeriod[]
  contributions: LeaguePoolContribution[]
  error: string | null
  onUpdate: (
    config: TournamentConfigInput,
    options: TournamentConfigurationUpdateOptions,
  ) => string | null
  onExit: () => void
}

function toConfigInput(tournament: Tournament): TournamentConfigInput {
  return {
    name: tournament.name,
    date: tournament.date,
    totalRounds: tournament.totalRounds,
    pairingMode: tournament.pairingMode,
    rotating1: tournament.rotatingAchievements[0]?.label ?? '',
    rotating2: tournament.rotatingAchievements[1]?.label ?? '',
    rotating3: tournament.rotatingAchievements[2]?.label ?? '',
    rotatingAchievements: tournament.rotatingAchievements.map((achievement) => ({
      ...achievement,
    })),
    type: tournament.type,
    prizeMode: tournament.prizeMode,
    leaguePeriodId: tournament.leaguePeriodId,
    prizePool: tournament.dateCreditConfig.prizePool || 40000,
    percentagesByPosition:
      tournament.dateCreditConfig.percentagesByPosition.length > 0
        ? [...tournament.dateCreditConfig.percentagesByPosition]
        : [50, 30, 20],
    achievementConfig: tournament.achievementConfig,
  }
}

export function SettingsView({
  tournament,
  leaguePeriods,
  contributions: _contributions,
  error,
  onUpdate,
  onExit,
}: SettingsViewProps) {
  const [editing, setEditing] = useState(false)
  const [pendingConfig, setPendingConfig] = useState<TournamentConfigInput | null>(null)
  const selectedLeague = leaguePeriods.find((period) => period.id === tournament.leaguePeriodId)
  const prizeSummary = calculateTournamentPrizeSummary(tournament, selectedLeague)
  const rules = tournament.achievementConfig
  const prizeModeLabel =
    tournament.prizeMode === 'league_auto'
      ? 'Fecha de Liga · automático'
      : tournament.prizeMode === 'manual_credit'
        ? 'Torneo independiente · crédito manual'
        : 'Torneo independiente · sin crédito'

  const submit = (config: TournamentConfigInput) => {
    const achievementChanged = !achievementConfigsEqual(
      tournament.achievementConfig,
      config.achievementConfig ?? tournament.achievementConfig,
    )
    const assessment = assessRoundReduction(tournament, config.totalRounds)
    const needsConfirmation =
      (achievementChanged && tournamentHasRecordedResults(tournament)) ||
      assessment.removableRoundNumbers.length > 0 ||
      tournament.status === 'finished'
    if (needsConfirmation) {
      setPendingConfig(config)
      return
    }
    const updateError = onUpdate(config, {})
    if (!updateError) setEditing(false)
  }

  const confirmUpdate = () => {
    if (!pendingConfig) return
    const updateError = onUpdate(pendingConfig, {
      recalculateResults: true,
      confirmPendingRoundRemoval: true,
      allowFinishedAdministration: true,
    })
    if (!updateError) {
      setPendingConfig(null)
      setEditing(false)
    }
  }

  return (
    <section className="settings-view" aria-labelledby="settings-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Configuración del evento</p>
          <h2 id="settings-title">{tournament.name}</h2>
          <p>La liga aporta valores iniciales; este evento conserva su propia instantánea.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onExit}>Volver al Inicio</button>
      </div>

      {error && <div className="form-message form-message--error section-message">{error}</div>}
      <div className="settings-grid">
        <article className="settings-card settings-card--wide">
          <div className="settings-card__heading">
            <span>01</span>
            <div><h3>Datos y reglas</h3><p>{tournament.date} · {tournament.totalRounds} rondas</p></div>
          </div>
          <div className="locked-config-grid">
            <div><span>Tipo</span><strong>{prizeModeLabel}</strong></div>
            {selectedLeague && <div><span>Liga</span><strong>{selectedLeague.name}</strong></div>}
            <div><span>Jugadores</span><strong>{tournament.participants.filter((participant) => !participant.isGhost).length}</strong></div>
            <div><span>Emparejamiento</span><strong>{PAIRING_MODE_LABELS[tournament.pairingMode]}</strong></div>
            <div><span>Pozo de la fecha</span><strong>{formatCurrency.format(prizeSummary.datePrizePool)}</strong></div>
            <div><span>Aporte mensual</span><strong>{formatCurrency.format(prizeSummary.monthlyPoolContribution)}</strong></div>
            <div><span>Ganar mesa</span><strong>{rules.win.enabled ? `${rules.win.points} pts.` : 'Desactivado'}</strong></div>
            <div><span>Eliminación</span><strong>{rules.elimination.enabled ? `${rules.elimination.points} pts.` : 'Desactivado'}</strong></div>
            <div><span>Sobrevivir</span><strong>{rules.survival.enabled ? `${rules.survival.points} pts.` : 'Desactivado'}</strong></div>
            <div><span>Rotativos</span><strong>{tournament.rotatingAchievements.filter((achievement) => rules[achievement.id]?.enabled).length} / {tournament.rotatingAchievements.length} activos</strong></div>
          </div>
          <div className="league-settings-actions">
            <small>Los cambios con resultados requieren recálculo explícito.</small>
            <button className="primary-button" type="button" onClick={() => setEditing(true)}>Modificar evento</button>
          </div>
        </article>
      </div>

      {editing && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="edit-event-title">
          <button className="modal-backdrop" type="button" aria-label="Cerrar" onClick={() => setEditing(false)} />
          <section className="admin-modal admin-modal--wide">
            <div className="modal-header">
              <div><p className="section-kicker">Administración</p><h2 id="edit-event-title">Modificar evento</h2></div>
              <button className="icon-button" type="button" onClick={() => setEditing(false)} aria-label="Cerrar"><CloseIcon /></button>
            </div>
            <TournamentForm
              key={tournament.updatedAt}
              initialValue={toConfigInput(tournament)}
              leaguePeriods={leaguePeriods}
              prizePlayerCount={tournament.prizePlayerCount}
              submitLabel="Guardar cambios"
              error={error}
              allowEventTypeChange={tournament.status === 'setup'}
              inheritLeagueDefaults={false}
              onSubmit={submit}
            />
          </section>
        </div>
      )}

      {pendingConfig && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="recalculate-title">
          <button className="modal-backdrop" type="button" aria-label="Cancelar" onClick={() => setPendingConfig(null)} />
          <section className="swap-modal">
            <div className="modal-header"><div><p className="section-kicker">Confirmación administrativa</p><h2 id="recalculate-title">Confirmar modificación</h2></div></div>
            <p className="modal-copy">
              Este cambio recalculará los puntajes de resultados ya registrados y puede modificar la clasificación. Los hechos de juego se conservarán.
            </p>
            {tournament.status === 'finished' && <div className="form-message form-message--error">Estás modificando un torneo finalizado. Los pozos consolidados no cambiarán silenciosamente.</div>}
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setPendingConfig(null)}>Cancelar</button>
              <button className="primary-button" type="button" onClick={confirmUpdate}>Recalcular y guardar</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
