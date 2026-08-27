import { ChevronRightIcon, TrophyIcon } from '../../components/icons'
import { calculateTournamentStanding } from '../../domain/leaderboard'
import {
  calculateLeaguePoolSummary,
  calculatePrizeDistribution,
  calculateTournamentPrizeSummary,
} from '../../domain/prizes'
import type { LeaguePeriod, LeaguePoolContribution, Tournament } from '../../domain/tournament'
import { formatCurrency } from '../../utils/format'

interface LeaderboardViewProps {
  tournament: Tournament
  leaguePeriod?: LeaguePeriod
  contributions: LeaguePoolContribution[]
}

export function LeaderboardView({
  tournament,
  leaguePeriod,
  contributions,
}: LeaderboardViewProps) {
  const entries = calculateTournamentStanding(tournament)
  const playersById = new Map(tournament.participants.map((player) => [player.id, player]))
  const committedTableCount = tournament.rounds.reduce(
    (count, round) =>
      count + round.tables.filter((table) => table.status === 'saved' || table.savedResults.length > 0).length,
    0,
  )
  const prizeSummary = calculateTournamentPrizeSummary(tournament, leaguePeriod)
  const datePrizes =
    prizeSummary.datePrizePool > 0
      ? calculatePrizeDistribution(
          prizeSummary.datePrizePool,
          prizeSummary.percentagesByPosition,
        )
      : []
  const leaguePools = leaguePeriod
    ? calculateLeaguePoolSummary(contributions, leaguePeriod.id)
    : { monthlyFinalizedPool: 0, monthlyProjectedPool: 0 }
  const monthlyProjectedPrizes =
    leaguePeriod?.status === 'active' && leaguePools.monthlyProjectedPool > 0
      ? calculatePrizeDistribution(
          leaguePools.monthlyProjectedPool,
          leaguePeriod.monthlyPrizePercentages,
        )
      : []

  return (
    <section className="leaderboard-view" aria-labelledby="standing-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Clasificación de la fecha</p>
          <h2 id="standing-title">Standing</h2>
          <p>El pozo se distribuye por posición sin aumentar el crédito disponible hasta su consolidación.</p>
        </div>
        <span className="projection-note">
          {committedTableCount === 0
            ? 'Sin resultados guardados'
            : `${committedTableCount} mesa(s) computada(s)`}
        </span>
      </div>

      <div className="leaderboard-prize-strip">
        <div>
          <span>{tournament.prizeMode === 'league_auto' ? 'Jugadores para pozo' : 'Participantes'}</span>
          <strong>{tournament.prizeMode === 'league_auto' ? prizeSummary.prizePlayerCount : tournament.participants.filter((participant) => !participant.isGhost).length}</strong>
        </div>
        <div><span>Pozo de fecha</span><strong>{formatCurrency.format(prizeSummary.datePrizePool)}</strong></div>
        {leaguePeriod && (
          <>
            <div><span>Mensual confirmado</span><strong>{formatCurrency.format(leaguePools.monthlyFinalizedPool)}</strong></div>
            <div><span>Mensual proyectado</span><strong>{formatCurrency.format(leaguePools.monthlyProjectedPool)}</strong></div>
          </>
        )}
      </div>

      <div className="leaderboard-card">
        <div className="leaderboard-card__head" aria-hidden="true">
          <span>Pos.</span><span>Jugador</span><span>Puntaje total</span><span>Logros</span>
          <span>Crédito fecha</span><span>Proyectado</span><span />
        </div>
        {entries.length === 0 ? (
          <div className="leaderboard-empty">Carga jugadores para preparar la clasificación.</div>
        ) : (
          <ol className="leaderboard-list">
            {entries.map((entry) => {
              const player = playersById.get(entry.participantId)
              if (!player) return null
              const datePrize = datePrizes[entry.position - 1]
              const monthlyPrize = monthlyProjectedPrizes[entry.position - 1]

              return (
                <li key={player.id}>
                  <span className="rank" title={`Posición ${entry.position}`}>
                    {entry.position <= 3 ? <TrophyIcon /> : entry.position}
                  </span>
                  <div className="leaderboard-player">
                    <span>{player.name.slice(0, 1)}</span>
                    <div>
                      <strong>{player.name}</strong>
                      <small>{player.active ? 'Activo' : 'DROP'} · Victorias: {entry.tableWins} · Eliminaciones: {entry.eliminations}</small>
                    </div>
                  </div>
                  <strong className="leaderboard-score">{entry.totalPoints}</strong>
                  <span className="leaderboard-achievements">{entry.achievementPoints} pts.</span>
                  <span className="leaderboard-credit">
                    {datePrize !== undefined ? formatCurrency.format(datePrize) : '—'}
                  </span>
                  <span className="leaderboard-projection">
                    {monthlyPrize !== undefined ? `${formatCurrency.format(monthlyPrize)} · PROY.` : '—'}
                  </span>
                  <button type="button" aria-label={`Ver detalle de ${player.name}`} disabled>
                    <ChevronRightIcon />
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
