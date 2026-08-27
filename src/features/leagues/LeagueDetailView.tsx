import { useState, type FormEvent } from 'react'
import { deriveTournamentTop, deriveTournamentWinner, getLeagueDates } from '../../domain/catalog'
import { calculateAvailableCredit } from '../../domain/credits'
import {
  buildLeagueDateCreditCorrections,
  buildLeagueFinancialDifferences,
  buildLeagueLeaderboard,
  findExactLeagueTieGroups,
  type LeagueLeaderboardEntry,
} from '../../domain/league'
import {
  calculateLeaguePoolSummary,
  calculatePrizeDistribution,
  calculateTournamentPrizeSummary,
} from '../../domain/prizes'
import type { LeaguePeriod, LeaguePrizeLedger, Tournament } from '../../domain/tournament'
import { buildLeagueReconciliation } from '../../domain/reconciliation'
import {
  buildCreditUsageImportPreview,
  type CreditUsageImportPreview,
} from '../../domain/creditImport'
import type { PlayerIdentity } from '../../domain/playerRegistry'
import { readSpreadsheetFile } from '../../services/xlsxReader'
import type { LeagueDetailTab } from '../../domain/workspace'
import { formatCurrency, formatTournamentDate } from '../../utils/format'

interface LeagueDetailViewProps {
  leaguePeriod: LeaguePeriod
  tournaments: Tournament[]
  ledger: LeaguePrizeLedger
  playerRegistry: PlayerIdentity[]
  activeTab: LeagueDetailTab
  onTabChange: (tab: LeagueDetailTab) => void
  onBack: () => void
  onOpenTournament: (tournamentId: string) => void
  onFinalize: (administrativeOrder?: string[]) => string | null
  onReopen: () => string | null
  onResolveFinancialReview: () => void
  onSynchronizeDatePrizes: () => void
  onApplyDateCreditCorrections: () => string | null
  onImportCreditUsage: (preview: CreditUsageImportPreview) => string | null
  onRegisterCreditMovement: (
    playerKey: string,
    amount: number,
    reason: string,
    kind: 'usage' | 'positive_adjustment' | 'negative_adjustment',
  ) => string | null
  onVoidCreditMovement: (movementId: string) => string | null
  onRegisterSpecialPoint: (playerKey: string, amount: number, reason: string) => string | null
  onVoidSpecialPoint: (movementId: string) => string | null
  onOpenChampionEditor: () => void
}

function tournamentStateLabel(tournament: Tournament): string {
  if (tournament.status === 'setup') return 'Configuración'
  if (tournament.status === 'active') return 'Activa'
  if (tournament.status === 'rounds_completed') return 'Rondas completas'
  return 'Finalizada'
}

function StandingTable({
  standings,
  ledger,
  onUseCredit,
  onManageSpecial,
}: {
  standings: LeagueLeaderboardEntry[]
  ledger: LeaguePrizeLedger
  onUseCredit: (entry: LeagueLeaderboardEntry) => void
  onManageSpecial: (entry: LeagueLeaderboardEntry) => void
}) {
  if (standings.length === 0) {
    return <div className="global-empty-state global-empty-state--card"><p>Aún no hay jugadores en el Leaderboard.</p></div>
  }
  return (
    <div className="league-standing-card">
      <div className="league-standing-head" aria-hidden="true">
        <span>Pos.</span><span>Jugador</span><span>Liga</span><span>Logros</span><span>Especiales</span><span>Crédito fechas</span><span>Pozo mensual</span><span>Total</span><span />
      </div>
      <ol className="league-standing-list">
        {standings.map((entry) => {
          const available = calculateAvailableCredit(ledger.creditMovements, entry.playerKey)
          return (
            <li key={entry.playerKey}>
              <strong className="standing-position">{entry.position}</strong>
              <div className="standing-player"><strong>{entry.playerName}</strong><small>{entry.participations} participación(es) · {entry.tableWins} victoria(s) · {entry.eliminations} eliminación(es)</small></div>
              <strong>{entry.leaguePoints}</strong>
              <span>{entry.achievementPoints}</span>
              <span>{entry.specialLeaguePoints}</span>
              <span className={`date-credit-value${entry.dateCreditDifference === 0 ? '' : ' has-difference'}`}>
                {formatCurrency.format(entry.dateCreditEarned)}
                {entry.dateCreditDifference > 0 ? (
                  <small>TEÓRICO {formatCurrency.format(entry.theoreticalDateCredit)} · +{formatCurrency.format(entry.dateCreditDifference)} POR CORREGIR</small>
                ) : entry.dateCreditDifference < 0 ? (
                  <small>TEÓRICO {formatCurrency.format(entry.theoreticalDateCredit)} · −{formatCurrency.format(Math.abs(entry.dateCreditDifference))} POR CORREGIR</small>
                ) : <small>CONSOLIDADO</small>}
              </span>
              <span className={entry.monthlyPrizeStatus === 'projected' ? 'projected-value' : 'final-value'}>{formatCurrency.format(entry.monthlyPrize)}<small>{entry.monthlyPrizeStatus === 'projected' ? 'PROY.' : 'FINAL'}</small></span>
              <span className={entry.totalCreditStatus === 'projected' ? 'projected-value' : 'final-value'}>{formatCurrency.format(entry.totalCredit)}<small>{entry.totalCreditStatus === 'projected' ? 'TOTAL PROY.' : 'TOTAL FINAL'}</small></span>
              <div className="standing-row-actions">
                <button className="text-button standing-use-button" type="button" onClick={() => onManageSpecial(entry)}>Puntos</button>
                <button className="text-button standing-use-button" type="button" onClick={() => onUseCredit(entry)}>{available > 0 ? 'Usar crédito' : 'Ver crédito'}</button>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function LeagueDetailView({
  leaguePeriod,
  tournaments,
  ledger,
  playerRegistry,
  activeTab,
  onTabChange,
  onBack,
  onOpenTournament,
  onFinalize,
  onReopen,
  onResolveFinancialReview,
  onSynchronizeDatePrizes,
  onApplyDateCreditCorrections,
  onImportCreditUsage,
  onRegisterCreditMovement,
  onVoidCreditMovement,
  onRegisterSpecialPoint,
  onVoidSpecialPoint,
  onOpenChampionEditor,
}: LeagueDetailViewProps) {
  const [showFinishConfirmation, setShowFinishConfirmation] = useState(false)
  const [showChampionPhotoOffer, setShowChampionPhotoOffer] = useState(false)
  const [creditPlayer, setCreditPlayer] = useState<LeagueLeaderboardEntry | null>(null)
  const [creditAmount, setCreditAmount] = useState(0)
  const [creditReason, setCreditReason] = useState('Uso en tienda')
  const [creditMovementKind, setCreditMovementKind] = useState<
    'usage' | 'positive_adjustment' | 'negative_adjustment'
  >('usage')
  const [modalError, setModalError] = useState<string | null>(null)
  const [specialPlayer, setSpecialPlayer] = useState<LeagueLeaderboardEntry | null>(null)
  const [specialQuantity, setSpecialQuantity] = useState(1)
  const [specialDirection, setSpecialDirection] = useState<1 | -1>(1)
  const [specialReason, setSpecialReason] = useState('')
  const [finishedSpecialAdministration, setFinishedSpecialAdministration] = useState(false)
  const [showReopenConfirmation, setShowReopenConfirmation] = useState(false)
  const [showFinancialReview, setShowFinancialReview] = useState(false)
  const [confirmDateCreditCorrection, setConfirmDateCreditCorrection] = useState(false)
  const [tieBreakOrder, setTieBreakOrder] = useState<string[]>([])
  const [creditImportPreview, setCreditImportPreview] = useState<CreditUsageImportPreview | null>(null)
  const dates = getLeagueDates(tournaments, leaguePeriod.id)
  const standings = buildLeagueLeaderboard(tournaments, leaguePeriod, ledger)
  const finishPreviewStandings = buildLeagueLeaderboard(
    tournaments,
    { ...leaguePeriod, administrativeLeaderboardPlayerKeys: tieBreakOrder },
    ledger,
  )
  const exactTieGroups = findExactLeagueTieGroups(finishPreviewStandings)
  const currentSpecialPlayer = specialPlayer
    ? standings.find((entry) => entry.playerKey === specialPlayer.playerKey) ?? specialPlayer
    : null
  const pools = calculateLeaguePoolSummary(ledger.contributions, leaguePeriod.id)
  const finalPool = leaguePeriod.finalizedMonthlyPool ?? pools.monthlyFinalizedPool
  const readyToFinish = dates.length > 0 && dates.every((date) => date.status === 'finished')
  const financialDifferences = buildLeagueFinancialDifferences(tournaments, leaguePeriod, ledger)
  const reconciliation = buildLeagueReconciliation(tournaments, leaguePeriod, ledger)
  const dateCreditCorrections = buildLeagueDateCreditCorrections(
    tournaments,
    leaguePeriod,
    ledger,
  )
  const dateCreditIncrease = dateCreditCorrections
    .filter((correction) => correction.direction === 'positive')
    .reduce((sum, correction) => sum + correction.amount, 0)
  const dateCreditDecrease = dateCreditCorrections
    .filter((correction) => correction.direction === 'negative')
    .reduce((sum, correction) => sum + correction.amount, 0)

  const confirmFinish = () => {
    const error = onFinalize(tieBreakOrder)
    if (error) {
      setModalError(error)
      return
    }
    setShowFinishConfirmation(false)
    setShowChampionPhotoOffer(true)
    setModalError(null)
  }

  const submitCreditUsage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!creditPlayer) return
    const error = onRegisterCreditMovement(
      creditPlayer.playerKey,
      creditAmount,
      creditReason,
      creditMovementKind,
    )
    if (error) {
      setModalError(error)
      return
    }
    setCreditPlayer(null)
    setCreditAmount(0)
    setCreditReason('Uso en tienda')
    setModalError(null)
  }

  const submitSpecialPoints = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!specialPlayer) return
    const error = onRegisterSpecialPoint(
      specialPlayer.playerKey,
      specialQuantity * specialDirection,
      specialReason,
    )
    if (error) {
      setModalError(error)
      return
    }
    setSpecialQuantity(1)
    setSpecialReason('')
    setModalError(null)
  }

  return (
    <section className="global-page league-detail" aria-labelledby="league-detail-title">
      <button className="back-link" type="button" onClick={onBack}>← Todas las ligas</button>
      <div className="global-page__heading league-detail__heading">
        <div>
          <p className="section-kicker">{leaguePeriod.status === 'active' ? 'Liga activa' : 'Liga finalizada'}</p>
          <h1 id="league-detail-title">{leaguePeriod.name}</h1>
          <p>{dates.length} fecha(s) · {standings[0] ? `${leaguePeriod.status === 'finished' ? 'Campeón' : 'Líder'}: ${standings[0].playerName}` : 'Sin clasificación todavía'}</p>
        </div>
        {leaguePeriod.status === 'active' ? (
          <button className="danger-outline-button" type="button" onClick={() => {
            setTieBreakOrder(standings.map((entry) => entry.playerKey))
            setShowFinishConfirmation(true)
            setModalError(null)
          }}>Finalizar Liga</button>
        ) : (
          <button className="secondary-button" type="button" onClick={() => setShowReopenConfirmation(true)}>Reabrir Liga</button>
        )}
      </div>

      {leaguePeriod.financialReviewRequired && (
        <div className="review-banner"><strong>⚠ REVISIÓN FINANCIERA REQUERIDA</strong><span>Los créditos consolidados no se modificaron automáticamente.</span><div><button className="secondary-button" type="button" onClick={() => setShowFinancialReview(true)}>Recalcular Leaderboard</button><button className="secondary-button" type="button" onClick={() => setShowFinancialReview(true)}>Revisar créditos</button></div></div>
      )}

      <div className="global-tabs league-detail-tabs" role="tablist" aria-label="Detalle de liga">
        {([
          ['summary', 'Resumen'],
          ['dates', 'Fechas'],
          ['leaderboard', 'Leaderboard'],
        ] as const).map(([id, label]) => (
          <button key={id} className={activeTab === id ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === id} onClick={() => onTabChange(id)}>{label}</button>
        ))}
      </div>

      {activeTab === 'summary' && (
        <div className="league-summary-grid">
          <article className="dashboard-panel">
            <div className="dashboard-panel__header"><div><span className="eyebrow-label">Competencia</span><h2>Estado general</h2></div><span className={`state-pill state-pill--${leaguePeriod.status}`}>{leaguePeriod.status === 'active' ? 'Activa' : 'Finalizada'}</span></div>
            <div className="metric-grid">
              <div><span>Fechas</span><strong>{dates.length}</strong></div>
              <div><span>Completadas</span><strong>{dates.filter((date) => date.status === 'finished').length}</strong></div>
              <div><span>{leaguePeriod.status === 'finished' ? 'Campeón' : 'Líder'}</span><strong>{standings[0]?.playerName ?? '—'}</strong></div>
              <div><span>Puntaje</span><strong>{standings[0]?.leaguePoints ?? 0}</strong></div>
            </div>
          </article>
          <article className="dashboard-panel">
            <div className="dashboard-panel__header"><div><span className="eyebrow-label">Pozos</span><h2>Pozo mensual</h2></div></div>
            <div className="metric-grid">
              <div><span>Confirmado</span><strong>{formatCurrency.format(leaguePeriod.status === 'finished' ? finalPool : pools.monthlyFinalizedPool)}</strong></div>
              <div><span>{leaguePeriod.status === 'finished' ? 'Final' : 'Proyectado'}</span><strong>{formatCurrency.format(leaguePeriod.status === 'finished' ? finalPool : pools.monthlyProjectedPool)}</strong></div>
            </div>
            <div className="prize-preview-list">
              {(leaguePeriod.status === 'finished' && leaguePeriod.finalizedMonthlyAwards
                ? leaguePeriod.finalizedMonthlyAwards.map((award) => award.amount)
                : pools.monthlyProjectedPool > 0
                  ? calculatePrizeDistribution(pools.monthlyProjectedPool, leaguePeriod.monthlyPrizePercentages)
                  : []
              ).map((amount, index) => <div key={index}><span>{index + 1}°</span><strong>{formatCurrency.format(amount)}</strong><small>{leaguePeriod.status === 'finished' ? 'FINAL' : 'PROYECTADO'}</small></div>)}
            </div>
            <button className="secondary-button panel-action" type="button" onClick={() => setShowFinancialReview(true)}>
              Abrir centro de conciliación
            </button>
          </article>
        </div>
      )}

      {activeTab === 'dates' && (
        dates.length === 0 ? (
          <div className="global-empty-state global-empty-state--card"><p>Esta liga todavía no tiene fechas asociadas.</p></div>
        ) : (
          <div className="league-dates-list">
            {dates.map((tournament) => {
              const winner = deriveTournamentWinner(tournament)
              const topThree = deriveTournamentTop(tournament, 3)
              const summary = calculateTournamentPrizeSummary(tournament, leaguePeriod)
              return (
                <article className="date-card" key={tournament.id}>
                  <div className="date-card__main">
                    <div className="catalog-card__topline"><span className={`state-pill state-pill--${tournament.status}`}>{tournamentStateLabel(tournament)}</span><span className="catalog-date">{formatTournamentDate(tournament.date)}</span></div>
                    <h2>{tournament.name}</h2>
                    <p>{tournament.status === 'active' ? `Ronda ${tournament.currentRound} / ${tournament.totalRounds}` : tournament.status === 'rounds_completed' ? 'Todas las rondas completas · pendiente de finalizar evento' : tournament.status === 'setup' ? `${tournament.participants.filter((participant) => !participant.isGhost).length} inscritos` : `${tournament.participants.filter((participant) => !participant.isGhost).length} jugadores · pozo ${formatCurrency.format(summary.datePrizePool)}`}</p>
                  </div>
                  <div className="date-card__result">
                    <span>{tournament.status === 'finished' ? 'Ganador' : 'Estado'}</span>
                    <strong>{winner?.playerName ?? (tournament.status === 'active' || tournament.status === 'rounds_completed' ? 'En juego' : 'Pendiente')}</strong>
                    {winner && <small>{winner.totalPoints} pts. · {winner.achievementPoints} logros</small>}
                  </div>
                  <div className="date-card__top3">
                    {topThree.length > 0 ? topThree.map((entry) => <span key={entry.playerKey}>{entry.position}° · {entry.playerName}</span>) : <span>Sin resultados finales</span>}
                  </div>
                  <button className="secondary-button" type="button" onClick={() => onOpenTournament(tournament.id)}>{tournament.status === 'finished' ? 'Ver Fecha' : tournament.status === 'setup' ? 'Configurar' : 'Continuar Fecha'}</button>
                </article>
              )
            })}
          </div>
        )
      )}

      {activeTab === 'leaderboard' && (
        <StandingTable
          standings={standings}
          ledger={ledger}
          onManageSpecial={(entry) => {
            setSpecialPlayer(entry)
            setSpecialQuantity(1)
            setSpecialDirection(1)
            setSpecialReason('')
            setFinishedSpecialAdministration(false)
            setModalError(null)
          }}
          onUseCredit={(entry) => { setCreditPlayer(entry); setCreditAmount(0); setCreditMovementKind('usage'); setCreditReason('Uso en tienda'); setModalError(null) }}
        />
      )}

      {showFinishConfirmation && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="finish-league-title">
          <button className="modal-backdrop" type="button" aria-label="Cerrar" onClick={() => setShowFinishConfirmation(false)} />
          <div className="swap-modal finish-league-modal">
            <div className="modal-header"><div><p className="section-kicker">Confirmación administrativa</p><h2 id="finish-league-title">Finalizar Liga</h2></div><button className="drawer-close" type="button" onClick={() => setShowFinishConfirmation(false)}>×</button></div>
            <p className="modal-copy">Cerrarás la competencia y consolidarás el pozo mensual. El uso posterior de crédito seguirá disponible.</p>
            <div className="finish-preview">
              <div><span>Campeón</span><strong>{finishPreviewStandings[0]?.playerName ?? 'Sin clasificación'}</strong></div>
              <div><span>Pozo mensual final</span><strong>{formatCurrency.format(pools.monthlyFinalizedPool)}</strong></div>
              {finishPreviewStandings.slice(0, leaguePeriod.monthlyPrizePercentages.length).map((entry) => <div key={entry.playerKey}><span>{entry.position}° · {entry.playerName}</span><strong>{formatCurrency.format(entry.monthlyPrize)}</strong></div>)}
            </div>
            {exactTieGroups.length > 0 && (
              <div className="tie-break-panel">
                <h3>Desempate administrativo exacto</h3>
                <p>Estos jugadores siguen empatados tras victorias, logros y eliminaciones. Ordena cada grupo antes de cerrar.</p>
                {exactTieGroups.map((group) => (
                  <div className="tie-break-group" key={group.map((entry) => entry.playerKey).join('-')}>
                    {group.map((entry, index) => (
                      <div key={entry.playerKey}>
                        <span>{entry.position}° · {entry.playerName}</span>
                        <div>
                          <button type="button" disabled={index === 0} onClick={() => setTieBreakOrder((current) => {
                            const next = [...current]
                            const position = next.indexOf(entry.playerKey)
                            const previousKey = group[index - 1]?.playerKey
                            const previousPosition = previousKey ? next.indexOf(previousKey) : -1
                            if (position >= 0 && previousPosition >= 0) [next[position], next[previousPosition]] = [next[previousPosition], next[position]]
                            return next
                          })}>↑</button>
                          <button type="button" disabled={index === group.length - 1} onClick={() => setTieBreakOrder((current) => {
                            const next = [...current]
                            const position = next.indexOf(entry.playerKey)
                            const nextKey = group[index + 1]?.playerKey
                            const nextPosition = nextKey ? next.indexOf(nextKey) : -1
                            if (position >= 0 && nextPosition >= 0) [next[position], next[nextPosition]] = [next[nextPosition], next[position]]
                            return next
                          })}>↓</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {!readyToFinish && <div className="form-message form-message--error">Todas las fechas deben estar finalizadas antes de cerrar la liga.</div>}
            {modalError && <div className="form-message form-message--error">{modalError}</div>}
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowFinishConfirmation(false)}>Cancelar</button><button className="danger-button" type="button" disabled={!readyToFinish} onClick={confirmFinish}>Confirmar cierre</button></div>
          </div>
        </div>
      )}

      {showChampionPhotoOffer && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="champion-photo-offer-title">
          <button className="modal-backdrop" type="button" aria-label="Agregar después" onClick={() => setShowChampionPhotoOffer(false)} />
          <section className="swap-modal champion-photo-offer-modal">
            <div className="modal-header"><div><p className="section-kicker">Liga finalizada</p><h2 id="champion-photo-offer-title">Campeón · {finishPreviewStandings[0]?.playerName ?? 'Sin clasificación'}</h2></div></div>
            <p className="modal-copy">El registro histórico quedó guardado. La foto es opcional y no afecta resultados ni créditos.</p>
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowChampionPhotoOffer(false)}>Agregar después</button><button className="primary-button" type="button" onClick={() => { setShowChampionPhotoOffer(false); onOpenChampionEditor() }}>Subir foto del campeón</button></div>
          </section>
        </div>
      )}

      {creditPlayer && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="credit-usage-title">
          <button className="modal-backdrop" type="button" aria-label="Cerrar" onClick={() => setCreditPlayer(null)} />
          <form className="swap-modal" onSubmit={submitCreditUsage}>
            <div className="modal-header"><div><p className="section-kicker">Movimiento de crédito</p><h2 id="credit-usage-title">Registrar uso · {creditPlayer.playerName}</h2></div><button className="drawer-close" type="button" onClick={() => setCreditPlayer(null)}>×</button></div>
            <div className="credit-player-summary">
              <div><span>Crédito de fechas</span><strong>{formatCurrency.format(creditPlayer.dateCreditEarned)}</strong><small>{creditPlayer.dateCreditDifference === 0 ? 'CONSOLIDADO' : `TEÓRICO ${formatCurrency.format(creditPlayer.theoreticalDateCredit)}`}</small></div>
              <div><span>Pozo mensual</span><strong>{formatCurrency.format(creditPlayer.monthlyPrize)}</strong><small>{creditPlayer.monthlyPrizeStatus === 'projected' ? 'PROYECTADO' : 'FINAL'}</small></div>
              <div><span>Total</span><strong>{formatCurrency.format(creditPlayer.totalCredit)}</strong><small>{creditPlayer.totalCreditStatus === 'projected' ? 'PROYECTADO' : 'FINAL'}</small></div>
              <div><span>Disponible ahora</span><strong>{formatCurrency.format(calculateAvailableCredit(ledger.creditMovements, creditPlayer.playerKey))}</strong><small>UTILIZABLE</small></div>
            </div>
            {creditPlayer.dateCreditDifference !== 0 && (
              <div className="date-credit-notice is-pending">
                <strong>Ajuste pendiente: {creditPlayer.dateCreditDifference > 0 ? '+' : '−'}{formatCurrency.format(Math.abs(creditPlayer.dateCreditDifference))}</strong>
                <span>{creditPlayer.dateCreditDifference > 0 ? 'El Standing corregido otorga más crédito. Confirma la corrección desde el Centro de conciliación.' : 'El Standing corregido otorga menos crédito. Al confirmar la corrección se registrará un descuento trazable.'}</span>
              </div>
            )}
            <p className="modal-copy">El crédito consolidado de fechas puede utilizarse inmediatamente. El pozo mensual proyectado no aumenta el disponible hasta que la liga finalice.</p>
            <div className="choice-buttons choice-buttons--compact credit-kind-buttons" role="group" aria-label="Tipo de movimiento">
              <button type="button" className={creditMovementKind === 'usage' ? 'is-selected' : ''} onClick={() => { setCreditMovementKind('usage'); setCreditReason('Uso en tienda') }}>Uso</button>
              <button type="button" className={creditMovementKind === 'positive_adjustment' ? 'is-selected' : ''} onClick={() => { setCreditMovementKind('positive_adjustment'); setCreditReason('Ajuste administrativo') }}>Ajuste +</button>
              <button type="button" className={creditMovementKind === 'negative_adjustment' ? 'is-selected' : ''} onClick={() => { setCreditMovementKind('negative_adjustment'); setCreditReason('Ajuste administrativo') }}>Ajuste −</button>
            </div>
            <label className="field"><span>Monto</span><input required min="100" step="100" type="number" value={creditAmount} onChange={(event) => setCreditAmount(Number(event.target.value))} /></label>
            <label className="field"><span>Motivo</span><input required value={creditReason} onChange={(event) => setCreditReason(event.target.value)} /></label>
            {modalError && <div className="form-message form-message--error">{modalError}</div>}
            <div className="credit-movement-history">
              <h3>Movimientos</h3>
              {ledger.creditMovements.filter((movement) => movement.playerKey === creditPlayer.playerKey).length === 0 ? (
                <p>Sin movimientos registrados.</p>
              ) : ledger.creditMovements
                .filter((movement) => movement.playerKey === creditPlayer.playerKey)
                .slice()
                .reverse()
                .map((movement) => (
                  <div className={movement.status === 'void' ? 'is-void' : ''} key={movement.id}>
                    <span>{movement.reason}<small>{movement.type} · {movement.status === 'void' ? 'ANULADO' : 'ACTIVO'}</small></span>
                    <strong>{formatCurrency.format(movement.amount)}</strong>
                    {movement.status === 'active' && (
                      <button type="button" onClick={() => {
                        if (!window.confirm('¿Anular este movimiento? El registro se conservará como anulado.')) return
                        const error = onVoidCreditMovement(movement.id)
                        setModalError(error)
                      }}>Anular</button>
                    )}
                  </div>
                ))}
            </div>
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setCreditPlayer(null)}>Cerrar</button><button className="primary-button" type="submit">{creditMovementKind === 'usage' ? 'Registrar uso' : 'Registrar ajuste'}</button></div>
          </form>
        </div>
      )}

      {currentSpecialPlayer && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="special-points-title">
          <button className="modal-backdrop" type="button" aria-label="Cerrar" onClick={() => setSpecialPlayer(null)} />
          <form className="swap-modal special-points-modal" onSubmit={submitSpecialPoints}>
            <div className="modal-header"><div><p className="section-kicker">Leaderboard de liga</p><h2 id="special-points-title">{currentSpecialPlayer.playerName}</h2></div><button className="drawer-close" type="button" onClick={() => setSpecialPlayer(null)}>×</button></div>
            <div className="special-player-summary">
              <div><span>Puntaje de liga</span><strong>{currentSpecialPlayer.leaguePoints}</strong></div>
              <div><span>Logros acumulados</span><strong>{currentSpecialPlayer.achievementPoints}</strong></div>
              <div><span>Puntos especiales</span><strong>{currentSpecialPlayer.specialLeaguePoints}</strong></div>
            </div>

            {leaguePeriod.status === 'finished' && !finishedSpecialAdministration ? (
              <div className="finished-special-readonly">
                <div className="form-message form-message--error">Liga finalizada: los puntos especiales están en modo consulta.</div>
                <button className="danger-outline-button" type="button" onClick={() => setFinishedSpecialAdministration(true)}>Modificar puntos especiales</button>
              </div>
            ) : (
              <>
                {leaguePeriod.status === 'finished' && <div className="form-message form-message--error">Estás modificando una liga finalizada. Esto puede cambiar el Leaderboard histórico y marcará la liga para revisión.</div>}
                <h3>Registrar puntos especiales</h3>
                <div className="choice-buttons choice-buttons--compact" role="group" aria-label="Tipo de ajuste de puntos">
                  <button type="button" className={specialDirection === 1 ? 'is-selected' : ''} onClick={() => setSpecialDirection(1)}>Sumar</button>
                  <button type="button" className={specialDirection === -1 ? 'is-selected' : ''} onClick={() => setSpecialDirection(-1)}>Corrección negativa</button>
                </div>
                <div className="special-quantity-control" aria-label={`${specialQuantity} puntos`}>
                  <button type="button" disabled={specialQuantity <= 1} onClick={() => setSpecialQuantity((current) => Math.max(1, current - 1))}>−</button>
                  <strong>{specialDirection === -1 ? '−' : '+'}{specialQuantity}</strong>
                  <button type="button" onClick={() => setSpecialQuantity((current) => current + 1)}>+</button>
                </div>
                <label className="field"><span>Motivo</span><input value={specialReason} placeholder="Ej. Actividad comunidad" onChange={(event) => setSpecialReason(event.target.value)} /></label>
                <button className="primary-button" type="submit">Registrar</button>
              </>
            )}

            {modalError && <div className="form-message form-message--error">{modalError}</div>}
            <div className="credit-movement-history">
              <h3>Historial</h3>
              {ledger.specialPointMovements.filter((movement) => movement.leaguePeriodId === leaguePeriod.id && movement.playerKey === currentSpecialPlayer.playerKey).length === 0 ? <p>Sin movimientos registrados.</p> : ledger.specialPointMovements
                .filter((movement) => movement.leaguePeriodId === leaguePeriod.id && movement.playerKey === currentSpecialPlayer.playerKey)
                .slice()
                .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
                .map((movement) => (
                  <div className={movement.status === 'void' ? 'is-void' : ''} key={movement.id}>
                    <span>{movement.reason ?? 'Sin motivo'}<small>{movement.status === 'void' ? 'ANULADO' : new Date(movement.createdAt).toLocaleString('es-CL')}</small></span>
                    <strong>{movement.amount > 0 ? '+' : ''}{movement.amount}</strong>
                    {movement.status === 'active' && (leaguePeriod.status === 'active' || finishedSpecialAdministration) && <button type="button" onClick={() => {
                      if (!window.confirm('¿Anular este movimiento? El registro se conservará en el historial.')) return
                      setModalError(onVoidSpecialPoint(movement.id))
                    }}>Anular</button>}
                  </div>
                ))}
              <p><strong>Total puntos especiales: {currentSpecialPlayer.specialLeaguePoints}</strong></p>
            </div>
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setSpecialPlayer(null)}>Cerrar</button></div>
          </form>
        </div>
      )}

      {showReopenConfirmation && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="reopen-league-title">
          <button className="modal-backdrop" type="button" aria-label="Cancelar reapertura" onClick={() => setShowReopenConfirmation(false)} />
          <section className="swap-modal">
            <div className="modal-header"><div><p className="section-kicker">Acción administrativa</p><h2 id="reopen-league-title">Reabrir Liga</h2></div></div>
            <p className="modal-copy">Esta liga ya fue finalizada. Reabrirla permitirá correcciones deportivas y modificar puntos especiales. Los movimientos de crédito ya consolidados no serán modificados automáticamente.</p>
            {modalError && <div className="form-message form-message--error">{modalError}</div>}
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowReopenConfirmation(false)}>Cancelar</button><button className="danger-button" type="button" onClick={() => {
              const error = onReopen()
              if (error) { setModalError(error); return }
              setShowReopenConfirmation(false)
              setModalError(null)
            }}>Reabrir Liga</button></div>
          </section>
        </div>
      )}

      {showFinancialReview && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="financial-review-title">
          <button className="modal-backdrop" type="button" aria-label="Cerrar revisión" onClick={() => setShowFinancialReview(false)} />
          <section className="swap-modal financial-review-modal reconciliation-modal">
            <div className="modal-header"><div><p className="section-kicker">Fuente de verdad</p><h2 id="financial-review-title">Centro de conciliación</h2></div></div>
            <p className="modal-copy">Compara el crédito teórico deportivo con los movimientos consolidados y el uso registrado. Recalcular nunca modifica CreditMovement.</p>
            <div className="reconciliation-summary">
              <div><span>Teórico</span><strong>{formatCurrency.format(reconciliation.theoreticalTotal)}</strong></div>
              <div><span>Consolidado</span><strong>{formatCurrency.format(reconciliation.consolidatedTotal)}</strong></div>
              <div><span>Diferencia</span><strong>{formatCurrency.format(reconciliation.differenceTotal)}</strong></div>
              <div><span>Uso asociado</span><strong>{formatCurrency.format(reconciliation.leagueUsageTotal)}</strong></div>
            </div>
            <div className="reconciliation-table-wrap">
              <table className="reconciliation-table">
                <thead><tr><th>Jugador</th><th>Fecha teórico</th><th>Fecha consolidado</th><th>Mes teórico</th><th>Mes consolidado</th><th>Uso</th><th>Diferencia</th></tr></thead>
                <tbody>{reconciliation.rows.map((row) => (
                  <tr key={row.playerKey}><td>{row.playerName}</td><td>{formatCurrency.format(row.theoreticalDateCredit)}</td><td>{formatCurrency.format(row.consolidatedDateCredit)}</td><td>{formatCurrency.format(row.theoreticalMonthlyCredit)}</td><td>{formatCurrency.format(row.consolidatedMonthlyCredit)}</td><td>{formatCurrency.format(row.leagueUsage)}</td><td>{formatCurrency.format(row.difference)}</td></tr>
                ))}</tbody>
              </table>
            </div>
            {dateCreditCorrections.length > 0 && (
              <div className="date-compensation-panel">
                <div>
                  <h3>Correcciones de crédito pendientes</h3>
                  <p>Se aplicarán aumentos y descuentos para que el crédito efectivo de todos los jugadores coincida con el Standing corregido.</p>
                  <p><strong>Aumentos: +{formatCurrency.format(dateCreditIncrease)}</strong> · <strong>Descuentos: −{formatCurrency.format(dateCreditDecrease)}</strong></p>
                </div>
                <div className="date-compensation-list">
                  {dateCreditCorrections.map((correction) => (
                    <div key={correction.sourceReference}>
                      <span><strong>{correction.playerName}</strong><small>{correction.tournamentName} · {formatCurrency.format(correction.consolidated)} → {formatCurrency.format(correction.theoretical)}</small></span>
                      <b className={correction.direction === 'negative' ? 'is-negative' : ''}>{correction.direction === 'positive' ? '+' : '−'}{formatCurrency.format(correction.amount)}</b>
                    </div>
                  ))}
                </div>
                {confirmDateCreditCorrection ? (
                  <div className="date-compensation-confirm">
                    <strong>¿Confirmas corregir {dateCreditCorrections.length} movimiento(s)?</strong>
                    <span>Se registrarán ajustes positivos y negativos trazables. Un descuento puede dejar saldo negativo si el jugador ya utilizó parte del crédito.</span>
                    <div>
                      <button className="secondary-button" type="button" onClick={() => setConfirmDateCreditCorrection(false)}>Cancelar</button>
                      <button className="primary-button" type="button" onClick={() => {
                        const error = onApplyDateCreditCorrections()
                        setModalError(error)
                        if (!error) setConfirmDateCreditCorrection(false)
                      }}>Confirmar correcciones</button>
                    </div>
                  </div>
                ) : (
                  <button className="primary-button" type="button" onClick={() => setConfirmDateCreditCorrection(true)}>Corregir crédito de {dateCreditCorrections.length} jugador(es)</button>
                )}
              </div>
            )}
            <div className="financial-difference-list reconciliation-compact-list">
              {financialDifferences.filter((difference) => difference.difference !== 0).map((difference) => (
                <div key={difference.playerKey}><strong>{difference.playerName}</strong><span>Mes consolidado: {formatCurrency.format(difference.consolidated)}</span><span>Mes teórico: {formatCurrency.format(difference.theoretical)}</span><b>Diferencia: {formatCurrency.format(difference.difference)}</b></div>
              ))}
            </div>
            <div className="credit-import-panel">
              <div><h3>Importar uso desde Excel</h3><p>Lee localmente una hoja con columnas Jugador y Crédito Usado. Nada se envía fuera del navegador.</p></div>
              <label className="secondary-button backup-import-button">Seleccionar .xlsx o .csv<input accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" type="file" onChange={async (event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                try {
                  const sheets = await readSpreadsheetFile(file)
                  setCreditImportPreview(buildCreditUsageImportPreview(sheets, file.name, leaguePeriod.id, playerRegistry, ledger.creditMovements))
                  setModalError(null)
                } catch (error) {
                  setModalError(error instanceof Error ? error.message : 'No se pudo leer el archivo.')
                }
              }} /></label>
              {creditImportPreview && (
                <div className="credit-import-preview">
                  <p><strong>{creditImportPreview.rows.filter((row) => row.status === 'ready').length}</strong> movimiento(s) listos · {creditImportPreview.rows.filter((row) => row.status === 'unmatched').length} sin identidad · {creditImportPreview.rows.filter((row) => row.status === 'duplicate').length} duplicados</p>
                  <div className="credit-import-rows">{creditImportPreview.rows.map((row) => <div className={`credit-import-row status-${row.status}`} key={row.sourceReference}><span>{row.playerName || 'Sin nombre'}<small>{row.sheetName} · fila {row.rowNumber}</small></span><strong>{formatCurrency.format(row.amount)}</strong><em>{row.message}</em></div>)}</div>
                  <button className="primary-button" type="button" disabled={!creditImportPreview.rows.some((row) => row.status === 'ready')} onClick={() => {
                    const importError = onImportCreditUsage(creditImportPreview)
                    if (importError) { setModalError(importError); return }
                    setCreditImportPreview(null)
                    setModalError(null)
                  }}>Importar movimientos válidos</button>
                </div>
              )}
            </div>
            {modalError && <div className="form-message form-message--error">{modalError}</div>}
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setShowFinancialReview(false)}>Cerrar</button>
              {reconciliation.missingDateCredit > 0 && <button className="secondary-button" type="button" onClick={onSynchronizeDatePrizes}>Consolidar fechas faltantes</button>}
              {leaguePeriod.financialReviewRequired && <button className="primary-button" type="button" disabled={dateCreditCorrections.length > 0} title={dateCreditCorrections.length > 0 ? 'Aplica primero todas las correcciones de crédito.' : undefined} onClick={() => { onResolveFinancialReview(); setShowFinancialReview(false) }}>Marcar revisión como resuelta</button>}
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
