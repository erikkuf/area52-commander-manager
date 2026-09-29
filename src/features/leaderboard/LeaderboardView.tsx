import { ChevronRightIcon, TrophyIcon } from '../../components/icons'
import { calculateTournamentStanding } from '../../domain/leaderboard'
import {
  calculateLeaguePoolSummary,
  calculatePrizeDistribution,
  calculateTournamentPrizeSummary,
} from '../../domain/prizes'
import type { LeaguePeriod, LeaguePoolContribution, Tournament, TournamentPenaltyDefinition } from '../../domain/tournament'
import { formatCurrency } from '../../utils/format'

interface LeaderboardViewProps {
  tournament: Tournament
  leaguePeriod?: LeaguePeriod
  contributions: LeaguePoolContribution[]
  penaltyCatalog: TournamentPenaltyDefinition[]
  onApplyPenalty: (playerKey: string, definitionId: string) => string | null
  onVoidPenalty: (movementId: string) => string | null
}

export function LeaderboardView({
  tournament,
  leaguePeriod,
  contributions,
  penaltyCatalog,
  onApplyPenalty,
  onVoidPenalty,
}: LeaderboardViewProps) {
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null)
  const [selectedDefinitionId, setSelectedDefinitionId] = useState('')
  const [penaltyError, setPenaltyError] = useState<string | null>(null)
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
  const selectedEntry = entries.find((entry) => entry.participantId === selectedParticipantId)
  const selectedPlayer = selectedEntry ? playersById.get(selectedEntry.participantId) : undefined
  const availablePenalties = penaltyCatalog.filter((definition) => definition.active)
  const selectedDefinition = availablePenalties.find((definition) => definition.id === selectedDefinitionId)
  const playerPenalties = selectedPlayer
    ? tournament.penaltyMovements.filter((movement) => movement.playerKey === selectedPlayer.playerKey)
      .slice().sort((first, second) => second.createdAt.localeCompare(first.createdAt))
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
                  <button type="button" aria-label={`Ver detalle de ${player.name}`} onClick={() => {
                    setSelectedParticipantId(player.id)
                    setSelectedDefinitionId(availablePenalties[0]?.id ?? '')
                    setPenaltyError(null)
                  }}>
                    <ChevronRightIcon />
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>
      {selectedEntry && selectedPlayer && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="standing-player-detail-title">
          <button className="modal-backdrop" type="button" aria-label="Cerrar detalle" onClick={() => setSelectedParticipantId(null)} />
          <section className="swap-modal financial-review-modal">
            <div className="modal-header">
              <div><p className="section-kicker">Detalle de la fecha</p><h2 id="standing-player-detail-title">{selectedPlayer.name}</h2></div>
              <button className="drawer-close" type="button" aria-label="Cerrar" onClick={() => setSelectedParticipantId(null)}>×</button>
            </div>
            <div className="leaderboard-prize-strip">
              <div><span>Puntaje total</span><strong>{selectedEntry.totalPoints}</strong></div>
              <div><span>Resultados de mesa</span><strong>{selectedEntry.achievementPoints}</strong></div>
              <div><span>Penalizaciones</span><strong>{selectedEntry.penaltyPoints}</strong></div>
            </div>
            <p className="modal-copy">{selectedEntry.savedTables} mesa(s) confirmada(s) · {selectedEntry.tableWins} victoria(s) · {selectedEntry.achievementCount} logro(s) rotativo(s) · {selectedEntry.eliminations} eliminación(es).</p>
            <h3>Penalizaciones de esta fecha</h3>
            {playerPenalties.length === 0 ? <p className="modal-copy">Sin penalizaciones registradas.</p> : (
              <div className="financial-difference-list">
                {playerPenalties.map((movement) => <div key={movement.id}>
                  <strong>{movement.name} · {movement.amount} pts. {movement.status === 'void' ? '· ANULADA' : ''}</strong>
                  {movement.description && <span>{movement.description}</span>}
                  <span>{new Date(movement.createdAt).toLocaleString('es-CL')}</span>
                  {movement.status === 'active' && <button className="text-button" type="button" onClick={() => {
                    if (!window.confirm(`¿Anular la penalización «${movement.name}»? El historial se conservará.${tournament.status === 'finished' ? ' La clasificación se recalculará; el crédito consolidado requiere revisión si cambia.' : ''}`)) return
                    setPenaltyError(onVoidPenalty(movement.id))
                  }}>Anular</button>}
                </div>)}
              </div>
            )}
            <h3>Aplicar penalización</h3>
            {availablePenalties.length === 0 ? <p className="modal-copy">No hay penalizaciones activas en Configuración global.</p> : <>
              <label className="field"><span>Penalización disponible</span><select value={selectedDefinitionId} onChange={(event) => setSelectedDefinitionId(event.target.value)}>
                {availablePenalties.map((definition) => <option key={definition.id} value={definition.id}>{definition.name} · {definition.points} pts.</option>)}
              </select></label>
              {selectedDefinition && <p className="modal-copy">{selectedDefinition.description || 'Sin descripción.'} Valor: {selectedDefinition.points} puntos.</p>}
              <button className="primary-button" type="button" disabled={!selectedDefinition} onClick={() => {
                if (!selectedDefinition || !window.confirm(`¿Aplicar «${selectedDefinition.name}» (${selectedDefinition.points} pts.) a ${selectedPlayer.name}?${tournament.status === 'finished' ? ' La clasificación se recalculará; el crédito consolidado requiere revisión si cambia.' : ''}`)) return
                setPenaltyError(onApplyPenalty(selectedPlayer.playerKey, selectedDefinition.id))
              }}>Aplicar penalización</button>
            </>}
            {penaltyError && <div className="form-message form-message--error">{penaltyError}</div>}
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setSelectedParticipantId(null)}>Cerrar</button></div>
          </section>
        </div>
      )}
    </section>
  )
}
import { useState } from 'react'
