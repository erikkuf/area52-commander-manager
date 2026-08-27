import { useEffect, useState } from 'react'
import { CloseIcon } from '../../components/icons'
import { PlayerResultRow } from '../../components/PlayerResultRow'
import { StatusBadge } from '../../components/StatusBadge'
import {
  isSurvivalControlDisabled,
  isWinnerControlDisabled,
  type PlayerResultChanges,
} from '../../domain/results'
import { previewTableCorrection, type StandingCorrectionPreview } from '../../domain/competitive'
import { calculateTournamentStanding } from '../../domain/leaderboard'
import { countSavedTables, isRoundComplete } from '../../domain/rounds'
import { requiresGhostPairing } from '../../domain/tables'
import type { Participant, Round, Tournament } from '../../domain/tournament'
import { formatCurrency } from '../../utils/format'
import { PAIRING_MODE_LABELS } from '../../domain/pairing'

interface TablesViewProps {
  tournament: Tournament
  error: string | null
  prizePool: number
  onOpenPlayers: () => void
  onStartTournament: (useGhost?: boolean) => void
  onSwapPlayers: (roundId: string, firstParticipantId: string, secondParticipantId: string) => void
  onConfirmRound: (roundId: string) => void
  onUpdateResult: (
    roundId: string,
    tableId: string,
    participantId: string,
    changes: PlayerResultChanges,
  ) => void
  onSaveTable: (roundId: string, tableId: string, historicalCorrection?: boolean) => void
  onBeginCorrection: (roundId: string, tableId: string) => void
  onBeginRoundCorrection: (roundId: string, tableId: string) => void
  onFinishRound: (roundId: string) => void
  onGenerateNextRound: (useGhost?: boolean) => void
  onFinalizeTournament: () => void
}

interface SwapPlayersModalProps {
  round: Round
  participants: Participant[]
  sourceParticipantId: string
  onSwap: (targetParticipantId: string) => void
  onClose: () => void
}

function SwapPlayersModal({
  round,
  participants,
  sourceParticipantId,
  onSwap,
  onClose,
}: SwapPlayersModalProps) {
  const [targetParticipantId, setTargetParticipantId] = useState('')
  const participantMap = new Map(participants.map((participant) => [participant.id, participant]))
  const sourceTable = round.tables.find((table) => table.participantIds.includes(sourceParticipantId))
  const sourcePlayer = participantMap.get(sourceParticipantId)
  const candidates = round.tables
    .filter((table) => table.id !== sourceTable?.id)
    .flatMap((table) =>
      table.participantIds.map((participantId) => ({
        participantId,
        tableNumber: table.tableNumber,
      })),
    )

  return (
    <div className="modal-layer" role="presentation">
      <button className="modal-backdrop" type="button" aria-label="Cerrar" onClick={onClose} />
      <section className="swap-modal" role="dialog" aria-modal="true" aria-labelledby="swap-title">
        <div className="modal-header">
          <div>
            <p className="section-kicker">Editar mesas</p>
            <h2 id="swap-title">Cambiar a {sourcePlayer?.name}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar intercambio">
            <CloseIcon />
          </button>
        </div>
        <p className="modal-copy">Selecciona un jugador de otra mesa. Ambos intercambiarán sus lugares.</p>
        <label className="field">
          <span>Jugador de reemplazo</span>
          <select value={targetParticipantId} onChange={(event) => setTargetParticipantId(event.target.value)}>
            <option value="">Seleccionar jugador…</option>
            {candidates.map((candidate) => (
              <option value={candidate.participantId} key={candidate.participantId}>
                Mesa {candidate.tableNumber} · {participantMap.get(candidate.participantId)?.name}
              </option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button
            className="primary-button"
            type="button"
            disabled={!targetParticipantId}
            onClick={() => onSwap(targetParticipantId)}
          >
            Confirmar cambio
          </button>
        </div>
      </section>
    </div>
  )
}

export function TablesView({
  tournament,
  error,
  prizePool,
  onOpenPlayers,
  onStartTournament,
  onSwapPlayers,
  onConfirmRound,
  onUpdateResult,
  onSaveTable,
  onBeginCorrection,
  onBeginRoundCorrection,
  onFinishRound,
  onGenerateNextRound,
  onFinalizeTournament,
}: TablesViewProps) {
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null)
  const [finishConfirmationOpen, setFinishConfirmationOpen] = useState(false)
  const [selectedRoundNumber, setSelectedRoundNumber] = useState(tournament.currentRound)
  const [correctionTarget, setCorrectionTarget] = useState<{ roundId: string; tableId: string } | null>(null)
  const [correctionPreview, setCorrectionPreview] = useState<StandingCorrectionPreview | null>(null)
  const [ghostAction, setGhostAction] = useState<'start' | 'next' | null>(null)
  const [finalizeEventOpen, setFinalizeEventOpen] = useState(false)
  useEffect(() => setSelectedRoundNumber(tournament.currentRound), [tournament.currentRound])
  const participantsById = new Map(
    tournament.participants.map((participant) => [participant.id, participant]),
  )
  const currentRound = tournament.rounds.find((round) => round.number === selectedRoundNumber)

  if (tournament.status === 'setup') {
    const activeCount = tournament.participants.filter(
      (participant) => participant.active && !participant.isGhost,
    ).length
    return (
      <section className="tables-view setup-empty-state" aria-labelledby="setup-title">
        <div className="setup-empty-state__icon">01</div>
        <p className="section-kicker">Preparación de la fecha</p>
        <h2 id="setup-title">Carga a los jugadores para generar la Ronda 1</h2>
        <p>
          Se necesitan al menos 3 participantes. Las mesas se distribuirán aleatoriamente en grupos
          de 3 o 4 y podrás corregirlas antes de confirmar.
        </p>
        <div className="setup-count"><strong>{activeCount}</strong><span>jugadores cargados</span></div>
        {error && <div className="form-message form-message--error">{error}</div>}
        <div className="setup-empty-state__actions">
          <button className="secondary-button" type="button" onClick={onOpenPlayers}>Administrar jugadores</button>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              if (requiresGhostPairing(tournament) && !tournament.ghostPairingAuthorized) {
                setGhostAction('start')
              } else {
                onStartTournament()
              }
            }}
          >Iniciar torneo</button>
        </div>
        {ghostAction === 'start' && (
          <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="setup-ghost-title">
            <button className="modal-backdrop" type="button" aria-label="Cancelar Jugador Fantasma" onClick={() => setGhostAction(null)} />
            <section className="swap-modal">
              <div className="modal-header"><div><p className="section-kicker">Distribución especial</p><h2 id="setup-ghost-title">Hay 5 jugadores activos</h2></div></div>
              <p className="modal-copy">No es posible generar mesas válidas de 3 o 4 jugadores. Usa un Jugador Fantasma para generar dos mesas de 3. No contará para puntajes, rankings, participaciones ni pozos.</p>
              <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setGhostAction(null)}>Cancelar</button><button className="primary-button" type="button" onClick={() => { onStartTournament(true); setGhostAction(null) }}>Usar Jugador Fantasma</button></div>
            </section>
          </div>
        )}
      </section>
    )
  }

  if (!currentRound) {
    return <div className="form-message form-message--error">No se encontró la ronda actual.</div>
  }

  const pairingMode = currentRound.status === 'pending'
  const roundFinished = currentRound.status === 'finished'
  const isCurrentSelected = currentRound.number === tournament.currentRound
  const correctionMode = roundFinished && currentRound.isCorrectionMode
  const registeredTables = countSavedTables(tournament, currentRound.id)
  const canFinish = isRoundComplete(tournament, currentRound.id)
  const hasNextRound = isCurrentSelected && tournament.currentRound < tournament.totalRounds
  const finalStanding = calculateTournamentStanding(tournament)
  const playersByStandingId = new Map(
    tournament.participants.map((participant) => [participant.id, participant]),
  )

  return (
    <section className="tables-view" aria-labelledby="round-title">
      <div className="round-selector" role="tablist" aria-label="Rondas del evento">
        {tournament.rounds
          .slice()
          .sort((first, second) => first.number - second.number)
          .map((round) => (
            <button
              type="button"
              role="tab"
              aria-selected={round.number === selectedRoundNumber}
              className={round.number === selectedRoundNumber ? 'is-active' : ''}
              onClick={() => setSelectedRoundNumber(round.number)}
              key={round.id}
            >
              R{round.number} {round.status === 'finished' ? '✓' : round.number === tournament.currentRound ? '●' : ''}
            </button>
          ))}
      </div>
      <div className="section-heading">
        <div>
          <p className="section-kicker">
            {pairingMode ? 'Mesas sin confirmar' : roundFinished ? 'Ronda finalizada' : 'Ronda en curso'}
          </p>
          <h2 id="round-title">Mesas · Ronda {currentRound.number}</h2>
          <p>
            {pairingMode
              ? 'Revisa la distribución y cambia jugadores antes de confirmar.'
              : roundFinished
                ? correctionMode
                  ? 'Corrección administrativa habilitada. La ronda conserva su estado finalizado.'
                  : '🔒 Modo lectura · Los resultados están cerrados y preservados.'
                : 'Registra los logros directamente en cada mesa.'}
          </p>
        </div>
        <div className="achievement-legend" aria-label="Leyenda de logros rotativos">
          {tournament.rotatingAchievements.filter((achievement) => tournament.achievementConfig[achievement.id]?.enabled).map((achievement) => (
            <span key={achievement.id} title={achievement.label}>
              <b>R{achievement.id.slice(-1)}</b> {achievement.label}
            </span>
          ))}
        </div>
      </div>

      {error && <div className="form-message form-message--error section-message">{error}</div>}

      {pairingMode && (
        <div className="pairing-notice">
          <div><strong>Distribución inicial lista · {PAIRING_MODE_LABELS[tournament.pairingMode]}</strong><span>Los resultados se habilitan al confirmar las mesas.</span></div>
          <button className="primary-button" type="button" onClick={() => onConfirmRound(currentRound.id)}>Confirmar mesas</button>
        </div>
      )}

      {roundFinished && (
        <div className="round-finished-banner" role="status">
          <div className="round-finished-banner__mark">✓</div>
          <div>
            <strong>Ronda {currentRound.number} finalizada</strong>
            <span>
              {hasNextRound
                ? 'Puedes gestionar DROP/reactivaciones antes de generar la siguiente.'
                : 'Todas las rondas configuradas están completas.'}
            </span>
          </div>
          <div className="round-finished-banner__actions">
            <button className="secondary-button" type="button" onClick={onOpenPlayers}>Jugadores</button>
            {!correctionMode && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  const firstSavedTable = currentRound.tables.find((table) => table.status === 'saved')
                  if (firstSavedTable) setCorrectionTarget({ roundId: currentRound.id, tableId: firstSavedTable.id })
                }}
              >
                Corregir ronda
              </button>
            )}
            {hasNextRound && (
              <button className="primary-button" type="button" onClick={() => {
                if (requiresGhostPairing(tournament) && !tournament.ghostPairingAuthorized) {
                  setGhostAction('next')
                } else {
                  onGenerateNextRound()
                }
              }}>
                Generar ronda siguiente
              </button>
            )}
            {isCurrentSelected && tournament.status === 'rounds_completed' && (
              <button className="primary-button" type="button" onClick={() => setFinalizeEventOpen(true)}>
                Finalizar evento
              </button>
            )}
          </div>
        </div>
      )}

      <div className="tables-list">
        {currentRound.tables.map((table) => {
          const resultEditingEnabled =
            (currentRound.status === 'active' || correctionMode) &&
            (table.status === 'pending' || table.status === 'edited')
          const savedAfterCorrection = table.status === 'saved' && table.editCount > 0

          return (
            <article className="table-card" key={table.id}>
              <div className="table-card__header">
                <div>
                  <span className="table-number">{String(table.tableNumber).padStart(2, '0')}</span>
                  <div>
                    <p>Mesa {table.tableNumber}</p>
                    <span>
                      {table.participantIds.length} jugadores
                      {savedAfterCorrection ? ` · ${table.editCount} corrección(es)` : ''}
                    </span>
                  </div>
                </div>
                {pairingMode ? <span className="pairing-badge">Por confirmar</span> : <StatusBadge status={table.status} />}
              </div>

              <div className={pairingMode ? 'table-card__body is-pairing' : 'table-card__body'}>
                {table.participantIds.map((participantId) => {
                  const player = participantsById.get(participantId)
                  if (!player) return null
                  const result = table.results.find((item) => item.participantId === participantId)
                  return (
                    <PlayerResultRow
                      key={participantId}
                      player={player}
                      result={result}
                      achievementConfig={tournament.achievementConfig}
                      rotatingAchievements={tournament.rotatingAchievements}
                      pairingMode={pairingMode}
                      disabled={!resultEditingEnabled}
                      winDisabled={isWinnerControlDisabled(table, participantId)}
                      survivalDisabled={isSurvivalControlDisabled(table, participantId)}
                      maxEliminations={Math.min(3, Math.max(0, table.participantIds.length - 1))}
                      onSwap={() => setSwapSourceId(participantId)}
                      onChange={(changes) => onUpdateResult(currentRound.id, table.id, participantId, changes)}
                    />
                  )
                })}
              </div>

              <div className="table-card__footer">
                <p>
                  {pairingMode
                    ? 'Usa “Cambiar” para intercambiar jugadores'
                    : table.status === 'pending'
                      ? 'Resultados aún no guardados'
                      : table.status === 'edited'
                        ? 'Corrección pendiente de guardar'
                        : savedAfterCorrection
                          ? 'Resultados guardados · mesa corregida'
                          : 'Todos los resultados están guardados'}
                </p>
                {!pairingMode && table.status !== 'saved' && (currentRound.status === 'active' || correctionMode) && (
                  <button className="save-table-button" type="button" onClick={() => {
                    if (correctionMode && table.status === 'edited') {
                      try {
                        setCorrectionPreview(previewTableCorrection(tournament, currentRound.id, table.id))
                        setCorrectionTarget({ roundId: currentRound.id, tableId: table.id })
                      } catch {
                        onSaveTable(currentRound.id, table.id, true)
                      }
                    } else {
                      onSaveTable(currentRound.id, table.id)
                    }
                  }}>
                    Guardar mesa
                  </button>
                )}
                {!pairingMode && table.status === 'saved' && (!roundFinished || correctionMode) && (
                  <button className="edit-results-button" type="button" onClick={() => onBeginCorrection(currentRound.id, table.id)}>
                    {roundFinished ? 'Editar resultados' : 'Editar resultados'}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {currentRound.status === 'active' && (
        <div className="round-footer">
          <div className="round-progress-copy">
            <span><strong>{registeredTables}</strong> / {currentRound.tables.length}</span>
            <div>
              <strong>Mesas registradas</strong>
              <small>{canFinish ? 'La ronda está lista para finalizar' : 'Guarda todas las mesas para continuar'}</small>
            </div>
          </div>
          <div className="round-progress-track" role="progressbar" aria-valuenow={registeredTables} aria-valuemin={0} aria-valuemax={currentRound.tables.length}>
            <span style={{ width: `${currentRound.tables.length ? (registeredTables / currentRound.tables.length) * 100 : 0}%` }} />
          </div>
          <button
            className="finish-round-button"
            type="button"
            disabled={!canFinish}
            onClick={() => setFinishConfirmationOpen(true)}
          >
            Finalizar ronda
          </button>
        </div>
      )}

      {swapSourceId && (
        <SwapPlayersModal
          round={currentRound}
          participants={tournament.participants}
          sourceParticipantId={swapSourceId}
          onClose={() => setSwapSourceId(null)}
          onSwap={(targetId) => {
            onSwapPlayers(currentRound.id, swapSourceId, targetId)
            setSwapSourceId(null)
          }}
        />
      )}

      {finishConfirmationOpen && (
        <div className="modal-layer" role="presentation">
          <button
            className="modal-backdrop"
            type="button"
            aria-label="Cancelar cierre de ronda"
            onClick={() => setFinishConfirmationOpen(false)}
          />
          <section className="swap-modal" role="dialog" aria-modal="true" aria-labelledby="finish-round-title">
            <div className="modal-header">
              <div>
                <p className="section-kicker">Confirmar cierre</p>
                <h2 id="finish-round-title">Finalizar Ronda {currentRound.number}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setFinishConfirmationOpen(false)}
                aria-label="Cancelar cierre de ronda"
              >
                <CloseIcon />
              </button>
            </div>
            <p className="modal-copy">
              Se preservarán todos los resultados guardados. Para corregirlos después tendrás que
              usar la acción administrativa de cada mesa.
            </p>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setFinishConfirmationOpen(false)}>
                Cancelar
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  onFinishRound(currentRound.id)
                  setFinishConfirmationOpen(false)
                }}
              >
                Confirmar y finalizar
              </button>
            </div>
          </section>
        </div>
      )}

      {correctionTarget && !correctionPreview && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="correct-round-title">
          <button className="modal-backdrop" type="button" aria-label="Cancelar corrección" onClick={() => setCorrectionTarget(null)} />
          <section className="swap-modal">
            <div className="modal-header"><div><p className="section-kicker">Acción administrativa</p><h2 id="correct-round-title">Corregir ronda finalizada</h2></div></div>
            <p className="modal-copy">Estás modificando una ronda finalizada. Esta corrección puede modificar el Standing final de esta fecha, la posición de los jugadores, el Leaderboard de la liga y créditos ya consolidados.</p>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setCorrectionTarget(null)}>Cancelar</button>
              <button className="danger-button" type="button" onClick={() => {
                onBeginRoundCorrection(correctionTarget.roundId, correctionTarget.tableId)
                setCorrectionTarget(null)
              }}>Continuar</button>
            </div>
          </section>
        </div>
      )}

      {correctionTarget && correctionPreview && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="correction-preview-title">
          <button className="modal-backdrop" type="button" aria-label="Cancelar corrección" onClick={() => { setCorrectionTarget(null); setCorrectionPreview(null) }} />
          <section className="swap-modal correction-preview-modal">
            <div className="modal-header"><div><p className="section-kicker">Comparación deportiva</p><h2 id="correction-preview-title">Confirmar corrección</h2></div></div>
            <p className="modal-copy">Esta corrección puede modificar el Standing final{tournament.type === 'league_date' ? ' y el Leaderboard de la liga' : ''}.</p>
            <div className="standing-comparison">
              <div><h3>Standing anterior</h3>{correctionPreview.previous.slice(0, 5).map((entry) => <p key={entry.participantId}>{entry.position}. {entry.playerName} · {entry.totalPoints} pts.</p>)}</div>
              <div><h3>Nuevo Standing</h3>{correctionPreview.next.slice(0, 5).map((entry) => <p key={entry.participantId}>{entry.position}. {entry.playerName} · {entry.totalPoints} pts.</p>)}</div>
            </div>
            {correctionPreview.changed && <div className="review-banner"><strong>⚠ Esta corrección requiere revisión financiera</strong><span>Los movimientos de crédito consolidados no se modificarán automáticamente.</span></div>}
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => { setCorrectionTarget(null); setCorrectionPreview(null) }}>Cancelar</button>
              <button className="primary-button" type="button" onClick={() => {
                onSaveTable(correctionTarget.roundId, correctionTarget.tableId, correctionPreview.changed)
                setCorrectionTarget(null)
                setCorrectionPreview(null)
              }}>Guardar corrección</button>
            </div>
          </section>
        </div>
      )}

      {ghostAction && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="ghost-confirm-title">
          <button className="modal-backdrop" type="button" aria-label="Cancelar Jugador Fantasma" onClick={() => setGhostAction(null)} />
          <section className="swap-modal">
            <div className="modal-header"><div><p className="section-kicker">Distribución especial</p><h2 id="ghost-confirm-title">Hay 5 jugadores activos</h2></div></div>
            <p className="modal-copy">No es posible generar mesas válidas de 3 o 4 jugadores. Puedes agregar un Jugador Fantasma para generar dos mesas de 3. No contará para puntajes, rankings, participaciones ni pozos.</p>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setGhostAction(null)}>Cancelar</button>
              <button className="primary-button" type="button" onClick={() => {
                if (ghostAction === 'start') onStartTournament(true)
                else onGenerateNextRound(true)
                setGhostAction(null)
              }}>Usar Jugador Fantasma</button>
            </div>
          </section>
        </div>
      )}

      {finalizeEventOpen && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="finalize-event-title">
          <button className="modal-backdrop" type="button" aria-label="Cancelar finalización" onClick={() => setFinalizeEventOpen(false)} />
          <section className="swap-modal finish-event-modal">
            <div className="modal-header"><div><p className="section-kicker">Standing final</p><h2 id="finalize-event-title">Finalizar {tournament.name}</h2></div></div>
            <p className="modal-copy">Al finalizar el evento, su Standing quedará consolidado y el evento pasará a Finalizados.</p>
            <div className="finish-preview">
              <div><span>Participantes</span><strong>{tournament.participants.filter((participant) => !participant.isGhost).length}</strong></div>
              <div><span>Rondas</span><strong>{tournament.totalRounds}</strong></div>
              <div><span>Pozo de fecha</span><strong>{formatCurrency.format(prizePool)}</strong></div>
              <div><span>Ganador</span><strong>{playersByStandingId.get(finalStanding[0]?.participantId)?.name ?? 'Sin resultados'}</strong></div>
              {finalStanding.slice(0, 3).map((entry) => <div key={entry.participantId}><span>{entry.position}° · {playersByStandingId.get(entry.participantId)?.name}</span><strong>{entry.totalPoints} pts.</strong></div>)}
            </div>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setFinalizeEventOpen(false)}>Cancelar</button>
              <button className="danger-button" type="button" onClick={() => { onFinalizeTournament(); setFinalizeEventOpen(false) }}>Finalizar evento</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
