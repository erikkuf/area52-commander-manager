import { useState } from 'react'
import { deriveTournamentWinner, getIndependentEvents } from '../../domain/catalog'
import { calculatePrizeDistribution, calculateTournamentPrizeSummary } from '../../domain/prizes'
import type { Tournament } from '../../domain/tournament'
import { formatCurrency, formatTournamentDate } from '../../utils/format'

interface EventsViewProps {
  tournaments: Tournament[]
  onOpenTournament: (tournamentId: string) => void
  onCreateTournament: () => void
}

export function EventsView({ tournaments, onOpenTournament, onCreateTournament }: EventsViewProps) {
  const [status, setStatus] = useState<'active' | 'finished'>('active')
  const events = getIndependentEvents(tournaments).filter((tournament) =>
    status === 'finished' ? tournament.status === 'finished' : tournament.status !== 'finished',
  )

  return (
    <section className="global-page" aria-labelledby="events-title">
      <div className="global-page__heading">
        <div>
          <p className="section-kicker">Fuera de liga</p>
          <h1 id="events-title">Eventos independientes</h1>
          <p>Solo se muestran torneos sin LeaguePeriod asociado.</p>
        </div>
        <button className="primary-button" type="button" onClick={onCreateTournament}>+ Nuevo torneo</button>
      </div>

      <div className="global-tabs" role="tablist" aria-label="Estado de eventos independientes">
        <button className={status === 'active' ? 'is-active' : ''} type="button" role="tab" aria-selected={status === 'active'} onClick={() => setStatus('active')}>Activos</button>
        <button className={status === 'finished' ? 'is-active' : ''} type="button" role="tab" aria-selected={status === 'finished'} onClick={() => setStatus('finished')}>Completados</button>
      </div>

      {events.length === 0 ? (
        <div className="global-empty-state global-empty-state--card">
          <strong>No hay eventos {status === 'active' ? 'activos' : 'completados'}.</strong>
          <p>Las fechas de liga se consultan exclusivamente dentro de su período.</p>
        </div>
      ) : (
        <div className="catalog-grid">
          {events.map((tournament) => {
            const winner = deriveTournamentWinner(tournament)
            const summary = calculateTournamentPrizeSummary(tournament)
            const prizes = summary.datePrizePool > 0
              ? calculatePrizeDistribution(summary.datePrizePool, summary.percentagesByPosition)
              : []
            return (
              <article className="catalog-card" key={tournament.id}>
                <div className="catalog-card__topline">
                  <span className={`state-pill state-pill--${tournament.status}`}>{tournament.status === 'setup' ? 'Configuración' : tournament.status === 'active' ? 'Activo' : tournament.status === 'rounds_completed' ? 'Rondas completas' : 'Finalizado'}</span>
                  <span className="catalog-date">{formatTournamentDate(tournament.date)}</span>
                </div>
                <h2>{tournament.name}</h2>
                <dl className="catalog-facts">
                  <div><dt>Jugadores</dt><dd>{tournament.participants.filter((participant) => !participant.isGhost).length}</dd></div>
                  <div><dt>{tournament.status === 'finished' ? 'Ganador' : 'Progreso'}</dt><dd>{winner?.playerName ?? (tournament.status === 'setup' ? 'Por iniciar' : tournament.status === 'rounds_completed' ? 'Pendiente de finalizar' : `Ronda ${tournament.currentRound} / ${tournament.totalRounds}`)}</dd></div>
                  <div><dt>Puntaje ganador</dt><dd>{winner ? `${winner.totalPoints} pts.` : '—'}</dd></div>
                  <div><dt>Crédito 1°</dt><dd>{prizes[0] !== undefined ? formatCurrency.format(prizes[0]) : 'Sin crédito'}</dd></div>
                </dl>
                <button className="secondary-button panel-action" type="button" onClick={() => onOpenTournament(tournament.id)}>{tournament.status === 'finished' ? 'Ver Resultados' : tournament.status === 'setup' ? 'Configurar' : 'Continuar'}</button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
