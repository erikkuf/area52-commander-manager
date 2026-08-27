import { countLeagueParticipations, deriveTournamentWinner, getLeagueDates } from '../../domain/catalog'
import { buildLeagueLeaderboard } from '../../domain/league'
import { calculateLeaguePoolSummary } from '../../domain/prizes'
import type { LeaguePrizeLedger, Tournament } from '../../domain/tournament'
import { formatCurrency, formatTournamentDate } from '../../utils/format'

interface DashboardViewProps {
  tournaments: Tournament[]
  ledger: LeaguePrizeLedger
  onOpenLeague: (leaguePeriodId: string) => void
  onOpenTournament: (tournamentId: string) => void
  onCreateTournament: () => void
}

function eventProgress(tournament: Tournament): string {
  if (tournament.status === 'setup') return 'Configuración pendiente'
  if (tournament.status === 'finished') return 'Evento finalizado'
  if (tournament.status === 'rounds_completed') return 'Rondas completas · falta finalizar evento'
  return `Ronda ${tournament.currentRound} / ${tournament.totalRounds}`
}

export function DashboardView({
  tournaments,
  ledger,
  onOpenLeague,
  onOpenTournament,
  onCreateTournament,
}: DashboardViewProps) {
  const activeLeague = ledger.leaguePeriods.find((period) => period.status === 'active')
  const leagueDates = activeLeague ? getLeagueDates(tournaments, activeLeague.id) : []
  const leagueStanding = activeLeague
    ? buildLeagueLeaderboard(tournaments, activeLeague, ledger)
    : []
  const leaguePools = activeLeague
    ? calculateLeaguePoolSummary(ledger.contributions, activeLeague.id)
    : null
  const activeEvents = tournaments
    .filter((tournament) => tournament.status === 'active' || tournament.status === 'rounds_completed')
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))

  return (
    <section className="global-page dashboard-page" aria-labelledby="dashboard-title">
      <div className="global-page__heading">
        <div>
          <p className="section-kicker">Vista general</p>
          <h1 id="dashboard-title">Inicio</h1>
          <p>Accede a la liga vigente o retoma un evento en curso.</p>
        </div>
        <div className="global-page__actions">
          <button className="primary-button" type="button" onClick={onCreateTournament}>+ Nuevo torneo</button>
        </div>
      </div>

      <div className="dashboard-grid">
        <article className="dashboard-panel dashboard-panel--league">
          <div className="dashboard-panel__header">
            <div>
              <span className="eyebrow-label">Liga activa</span>
              <h2>{activeLeague?.name ?? 'Sin liga activa'}</h2>
            </div>
            {activeLeague && <span className="state-pill state-pill--active">Activa</span>}
          </div>
          {activeLeague && leaguePools ? (
            <>
              <div className="metric-grid">
                <div><span>Fechas</span><strong>{leagueDates.length}</strong></div>
                <div><span>Completadas</span><strong>{leagueDates.filter((date) => date.status === 'finished').length}</strong></div>
                <div><span>Participaciones</span><strong>{countLeagueParticipations(tournaments, activeLeague.id)}</strong></div>
                <div><span>Líder actual</span><strong>{leagueStanding[0]?.playerName ?? 'Sin resultados'}</strong></div>
                <div><span>Pozo confirmado</span><strong>{formatCurrency.format(leaguePools.monthlyFinalizedPool)}</strong></div>
                <div><span>Pozo proyectado</span><strong>{formatCurrency.format(leaguePools.monthlyProjectedPool)}</strong></div>
              </div>
              <button className="primary-button panel-action" type="button" onClick={() => onOpenLeague(activeLeague.id)}>Abrir Liga</button>
            </>
          ) : (
            <div className="global-empty-state">
              <p>Crea un período desde Configuración para comenzar a organizar fechas.</p>
            </div>
          )}
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <span className="eyebrow-label">Eventos activos</span>
              <h2>En curso</h2>
            </div>
            <span className="count-pill">{activeEvents.length}</span>
          </div>
          {activeEvents.length === 0 ? (
            <div className="global-empty-state"><p>No hay eventos activos en este momento.</p></div>
          ) : (
            <div className="compact-event-list">
              {activeEvents.map((tournament) => {
                const winner = deriveTournamentWinner(tournament)
                return (
                  <div className="compact-event-row" key={tournament.id}>
                    <div>
                      <span>{tournament.type === 'league_date' ? 'Fecha de liga' : 'Independiente'} · {formatTournamentDate(tournament.date)}</span>
                      <strong>{tournament.name}</strong>
                      <small>{eventProgress(tournament)} · {tournament.participants.filter((participant) => !participant.isGhost).length} participantes{winner ? ` · ${winner.playerName}` : ''}</small>
                    </div>
                    <button className="secondary-button" type="button" onClick={() => onOpenTournament(tournament.id)}>Continuar</button>
                  </div>
                )
              })}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
