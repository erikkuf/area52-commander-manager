import type { LeaguePeriod, TournamentConfigInput } from '../../domain/tournament'
import { cloneAchievementConfig, DEFAULT_ACHIEVEMENT_CONFIG } from '../../domain/achievements'
import { TournamentForm } from './TournamentForm'
import { defaultTournamentConfig } from './tournamentFormDefaults'

interface CreateTournamentViewProps {
  error?: string | null
  leaguePeriods: LeaguePeriod[]
  defaultType?: 'league_date' | 'independent'
  embedded?: boolean
  onCancel?: () => void
  onCreate: (config: TournamentConfigInput) => void
}

export function CreateTournamentView({
  error,
  leaguePeriods,
  defaultType = 'league_date',
  embedded = false,
  onCancel,
  onCreate,
}: CreateTournamentViewProps) {
  const inheritedLeague = leaguePeriods.find(
    (period) => period.status === 'active',
  )
  const initialValue: TournamentConfigInput = {
    ...defaultTournamentConfig,
    type: defaultType,
    prizeMode: defaultType === 'league_date' ? 'league_auto' : 'none',
    leaguePeriodId: defaultType === 'league_date' ? inheritedLeague?.id : undefined,
    achievementConfig: cloneAchievementConfig(
      defaultType === 'league_date' && inheritedLeague
        ? inheritedLeague.defaultAchievementConfig
        : DEFAULT_ACHIEVEMENT_CONFIG,
    ),
  }
  const content = (
    <main className={embedded ? 'global-page create-event-page' : 'welcome-main'}>
      <div className="welcome-copy">
        {embedded && onCancel && <button className="back-link" type="button" onClick={onCancel}>← Volver al Inicio</button>}
        <p className="section-kicker">Nuevo torneo</p>
        <h1>Crea tu torneo de Commander</h1>
        <p>
          Configura la fecha y después carga a los participantes. Todo se guardará en este
          dispositivo.
        </p>
      </div>
      <TournamentForm
        initialValue={initialValue}
        leaguePeriods={leaguePeriods}
        submitLabel="Crear torneo"
        error={error}
        onSubmit={onCreate}
      />
    </main>
  )

  if (embedded) return content
  return (
    <div className="welcome-shell">
      <header className="welcome-header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            A<span>52</span>
          </span>
          <div>
            <p className="brand__eyebrow">ÁREA 52</p>
            <p className="brand__title">Commander Manager</p>
          </div>
        </div>
        <span className="local-only-badge">Guardado local</span>
      </header>

      {content}
    </div>
  )
}
