import { useState } from 'react'
import {
  countLeagueParticipations,
  getLeagueDates,
  getLeaguePeriodsByStatus,
} from '../../domain/catalog'
import { buildLeagueLeaderboard } from '../../domain/league'
import { calculateLeaguePoolSummary } from '../../domain/prizes'
import type { LeaguePrizeLedger, Tournament } from '../../domain/tournament'
import { formatCurrency } from '../../utils/format'

interface LeaguesViewProps {
  tournaments: Tournament[]
  ledger: LeaguePrizeLedger
  onOpenLeague: (leaguePeriodId: string) => void
}

export function LeaguesView({ tournaments, ledger, onOpenLeague }: LeaguesViewProps) {
  const [status, setStatus] = useState<'active' | 'finished'>('active')
  const periods = getLeaguePeriodsByStatus(ledger.leaguePeriods, status)

  return (
    <section className="global-page" aria-labelledby="leagues-title">
      <div className="global-page__heading">
        <div>
          <p className="section-kicker">Competencia mensual</p>
          <h1 id="leagues-title">Ligas</h1>
          <p>Consulta períodos vigentes y el archivo permanente de ligas cerradas.</p>
        </div>
      </div>

      <div className="global-tabs" role="tablist" aria-label="Estado de ligas">
        <button className={status === 'active' ? 'is-active' : ''} type="button" role="tab" aria-selected={status === 'active'} onClick={() => setStatus('active')}>Activas</button>
        <button className={status === 'finished' ? 'is-active' : ''} type="button" role="tab" aria-selected={status === 'finished'} onClick={() => setStatus('finished')}>Finalizadas</button>
      </div>

      {periods.length === 0 ? (
        <div className="global-empty-state global-empty-state--card">
          <strong>No hay ligas {status === 'active' ? 'activas' : 'finalizadas'}.</strong>
          <p>{status === 'active' ? 'Puedes crear un nuevo período desde Configuración.' : 'Las ligas cerradas aparecerán aquí permanentemente.'}</p>
        </div>
      ) : (
        <div className="catalog-grid">
          {periods.map((leaguePeriod) => {
            const dates = getLeagueDates(tournaments, leaguePeriod.id)
            const standings = buildLeagueLeaderboard(tournaments, leaguePeriod, ledger)
            const pools = calculateLeaguePoolSummary(ledger.contributions, leaguePeriod.id)
            const displayedPool = leaguePeriod.status === 'finished'
              ? leaguePeriod.finalizedMonthlyPool ?? pools.monthlyFinalizedPool
              : pools.monthlyFinalizedPool
            return (
              <article className="catalog-card" key={leaguePeriod.id}>
                <div className="catalog-card__topline">
                  <span className={`state-pill state-pill--${leaguePeriod.status}`}>{leaguePeriod.status === 'active' ? 'Activa' : 'Finalizada'}</span>
                  {leaguePeriod.reviewRequired && <span className="review-pill">Revisión requerida</span>}
                </div>
                <h2>{leaguePeriod.name}</h2>
                <dl className="catalog-facts">
                  <div><dt>Fechas</dt><dd>{dates.length}</dd></div>
                  <div><dt>Participaciones</dt><dd>{countLeagueParticipations(tournaments, leaguePeriod.id)}</dd></div>
                  <div><dt>{leaguePeriod.status === 'finished' ? 'Campeón' : 'Líder actual'}</dt><dd>{standings[0]?.playerName ?? 'Sin resultados'}</dd></div>
                  <div><dt>Pozo mensual {leaguePeriod.status === 'finished' ? 'final' : 'confirmado'}</dt><dd>{formatCurrency.format(displayedPool)}</dd></div>
                </dl>
                <button className="secondary-button panel-action" type="button" onClick={() => onOpenLeague(leaguePeriod.id)}>Ver Liga</button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
