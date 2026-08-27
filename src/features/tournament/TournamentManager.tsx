import { useState } from 'react'
import { AppHeader } from '../../components/AppHeader'
import { ManagerNavigationBar } from '../../components/ManagerNavigationBar'
import { PlayersDrawer } from '../../components/PlayersDrawer'
import { SegmentedNav, type AppView } from '../../components/SegmentedNav'
import {
  importParticipants,
  removeParticipant,
  renameParticipant,
  setParticipantActive,
  type ParticipantImportReport,
} from '../../domain/participants'
import {
  calculateLateRegistrationIncrease,
  calculateTournamentPrizeSummary,
  confirmLateRegistrationPrizePlayers,
} from '../../domain/prizes'
import {
  markTournamentFinancialReviewRequired,
  recalculateTournamentStanding,
  resolveTournamentFinancialReview,
} from '../../domain/competitive'
import { buildTournamentFinancialDifferences } from '../../domain/league'
import { beginRoundCorrection, beginTableCorrection, saveTableResults, updatePlayerResult } from '../../domain/results'
import { finalizeTournament, finishRound, generateNextRound } from '../../domain/rounds'
import { confirmRoundTables, swapRoundPlayers } from '../../domain/tables'
import type {
  LeaguePeriod,
  LeaguePrizeLedger,
  Tournament,
  TournamentConfigInput,
} from '../../domain/tournament'
import {
  getCurrentRound,
  startTournament,
  updateTournamentConfiguration,
  type TournamentConfigurationUpdateOptions,
} from '../../domain/tournamentOperations'
import { LeaderboardView } from '../leaderboard/LeaderboardView'
import { SettingsView } from '../settings/SettingsView'
import { TablesView } from '../tables/TablesView'

interface TournamentManagerProps {
  tournament: Tournament
  leaguePeriods: LeaguePeriod[]
  ledger: LeaguePrizeLedger
  storageStatus: 'saving' | 'saved' | 'error'
  activeView: AppView
  onActiveViewChange: (view: AppView) => void
  onTournamentChange: (tournament: Tournament) => void
  onHistoricalCorrection: (leaguePeriodId: string) => void
  onApplyDateCreditCorrections: () => string | null
  resolvePlayerKey: (name: string) => string
  onExit: () => void
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
}

export function TournamentManager({
  tournament,
  leaguePeriods,
  ledger,
  storageStatus,
  activeView,
  onActiveViewChange,
  onTournamentChange,
  onHistoricalCorrection,
  onApplyDateCreditCorrections,
  resolvePlayerKey,
  onExit,
}: TournamentManagerProps) {
  const countedIds = new Set(tournament.prizeParticipantIds)
  const [isPlayersDrawerOpen, setIsPlayersDrawerOpen] = useState(
    tournament.status === 'setup' && tournament.participants.every((participant) => participant.isGhost),
  )
  const [feedback, setFeedback] = useState<string | null>(null)
  const [importReport, setImportReport] = useState<ParticipantImportReport | null>(null)
  const [pendingLateRegistrationIds, setPendingLateRegistrationIds] = useState<string[]>(
    tournament.status !== 'setup' && tournament.prizeMode === 'league_auto'
      ? tournament.participants.filter((participant) => !participant.isGhost && !countedIds.has(participant.id)).map((participant) => participant.id)
      : [],
  )
  const [showFinancialReview, setShowFinancialReview] = useState(false)
  const [confirmDateCreditCorrection, setConfirmDateCreditCorrection] = useState(false)

  const runTournamentChange = (
    change: (current: Tournament) => Tournament,
    historicalCorrection = false,
  ) => {
    try {
      const next = change(tournament)
      onTournamentChange(next)
      if (historicalCorrection && tournament.leaguePeriodId) {
        onHistoricalCorrection(tournament.leaguePeriodId)
      }
      setFeedback(null)
    } catch (error) {
      setFeedback(messageFromError(error))
    }
  }

  const currentRound = getCurrentRound(tournament)
  const selectedLeague = leaguePeriods.find((period) => period.id === tournament.leaguePeriodId)
  const prizeSummary = calculateTournamentPrizeSummary(tournament, selectedLeague)
  const financialDifferences = buildTournamentFinancialDifferences(
    tournament,
    ledger,
    selectedLeague,
  )
  const pendingFinancialDifferences = financialDifferences.filter(
    (difference) => difference.difference !== 0,
  )
  const positiveFinancialDifference = pendingFinancialDifferences.reduce(
    (sum, difference) => sum + Math.max(0, difference.difference), 0,
  )
  const negativeFinancialDifference = pendingFinancialDifferences.reduce(
    (sum, difference) => sum + Math.max(0, -difference.difference), 0,
  )
  const pendingLatePlayers = tournament.participants.filter((participant) =>
    !participant.isGhost && pendingLateRegistrationIds.includes(participant.id),
  )
  const lateRegistrationIncrease = selectedLeague && pendingLatePlayers.length > 0
    ? calculateLateRegistrationIncrease(pendingLatePlayers.length, selectedLeague)
    : null

  return (
    <div className="app-shell">
      <ManagerNavigationBar
        contextLabel={tournament.type === 'league_date' ? selectedLeague?.name ?? 'Fecha de liga' : 'Evento independiente'}
        onExit={onExit}
      />
      <AppHeader tournament={tournament} storageStatus={storageStatus} onOpenPlayers={() => setIsPlayersDrawerOpen(true)} />

      <main className="app-main">
        <SegmentedNav activeView={activeView} onChange={(view) => { onActiveViewChange(view); setFeedback(null) }} />

        {tournament.financialReviewRequired && (
          <div className="review-banner"><strong>⚠ REVISIÓN FINANCIERA REQUERIDA</strong><span>El Standing cambió; los movimientos consolidados permanecen intactos.</span><div><button className="secondary-button" type="button" onClick={() => { runTournamentChange(recalculateTournamentStanding); setShowFinancialReview(true) }}>Recalcular Standing</button><button className="secondary-button" type="button" onClick={() => setShowFinancialReview(true)}>Revisar créditos</button></div></div>
        )}

        {activeView === 'tables' && (
          <TablesView
            tournament={tournament}
            error={feedback}
            prizePool={prizeSummary.datePrizePool}
            onOpenPlayers={() => setIsPlayersDrawerOpen(true)}
            onStartTournament={(useGhost) => runTournamentChange((current) => startTournament(current, undefined, undefined, useGhost))}
            onSwapPlayers={(roundId, firstId, secondId) => {
              runTournamentChange((current) => swapRoundPlayers(current, roundId, firstId, secondId))
            }}
            onConfirmRound={(roundId) => {
              runTournamentChange((current) => confirmRoundTables(current, roundId))
            }}
            onUpdateResult={(roundId, tableId, participantId, changes) => {
              runTournamentChange((current) => updatePlayerResult(current, roundId, tableId, participantId, changes))
            }}
            onSaveTable={(roundId, tableId, historicalCorrection) => {
              runTournamentChange(
                (current) => {
                  const saved = saveTableResults(current, roundId, tableId)
                  return historicalCorrection
                    ? markTournamentFinancialReviewRequired(saved)
                    : saved
                },
                historicalCorrection,
              )
            }}
            onBeginCorrection={(roundId, tableId) => {
              runTournamentChange((current) => beginTableCorrection(current, roundId, tableId))
            }}
            onBeginRoundCorrection={(roundId, tableId) => {
              runTournamentChange((current) =>
                beginTableCorrection(beginRoundCorrection(current, roundId), roundId, tableId),
              )
            }}
            onFinishRound={(roundId) => {
              runTournamentChange((current) => finishRound(current, roundId))
            }}
            onGenerateNextRound={(useGhost) => runTournamentChange((current) => generateNextRound(current, undefined, undefined, useGhost))}
            onFinalizeTournament={() => runTournamentChange((current) => finalizeTournament(current))}
          />
        )}
        {activeView === 'standing' && (
          <LeaderboardView tournament={tournament} leaguePeriod={selectedLeague} contributions={ledger.contributions} />
        )}
        {activeView === 'settings' && (
          <SettingsView
            tournament={tournament}
            leaguePeriods={leaguePeriods}
            contributions={ledger.contributions}
            error={feedback}
            onUpdate={(config: TournamentConfigInput, options: TournamentConfigurationUpdateOptions) => {
              try {
                const next = updateTournamentConfiguration(tournament, config, options)
                onTournamentChange(next)
                if (tournament.status === 'finished' && tournament.leaguePeriodId) {
                  onHistoricalCorrection(tournament.leaguePeriodId)
                }
                setFeedback(null)
                return null
              } catch (error) {
                const message = messageFromError(error)
                setFeedback(message)
                return message
              }
            }}
            onExit={onExit}
          />
        )}
      </main>

      <PlayersDrawer
        open={isPlayersDrawerOpen}
        players={tournament.participants}
        tournamentStatus={tournament.status}
        currentRound={currentRound}
        prizeSummary={tournament.prizeMode === 'league_auto' ? prizeSummary : undefined}
        lateRegistrationPreview={lateRegistrationIncrease ? { playerNames: pendingLatePlayers.map((player) => player.name), ...lateRegistrationIncrease } : null}
        feedback={feedback}
        importReport={importReport}
        onAddPlayers={(names) => {
          const result = importParticipants(tournament, names, undefined, resolvePlayerKey)
          onTournamentChange(result.tournament)
          setImportReport(result.report)
          if (tournament.status !== 'setup' && tournament.prizeMode === 'league_auto' && result.report.addedParticipantIds.length > 0) {
            setPendingLateRegistrationIds((current) => [...new Set([...current, ...result.report.addedParticipantIds])])
          }
          setFeedback(result.report.added === 0 && names.trim() ? 'No se agregó ningún jugador. Revisa los nombres duplicados.' : null)
        }}
        onRenamePlayer={(participantId, name) => runTournamentChange((current) => renameParticipant(current, participantId, name))}
        onRemovePlayer={(participantId) => runTournamentChange((current) => removeParticipant(current, participantId))}
        onToggleActive={(participantId, active) => runTournamentChange((current) => setParticipantActive(current, participantId, active))}
        onConfirmLateRegistration={() => {
          runTournamentChange((current) => confirmLateRegistrationPrizePlayers(current, pendingLateRegistrationIds))
          setPendingLateRegistrationIds([])
        }}
        onSkipLateRegistration={() => setPendingLateRegistrationIds([])}
        onClose={() => { setIsPlayersDrawerOpen(false); setFeedback(null); setImportReport(null) }}
      />

      {showFinancialReview && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="tournament-review-title">
          <button className="modal-backdrop" type="button" aria-label="Cerrar revisión" onClick={() => setShowFinancialReview(false)} />
          <section className="swap-modal financial-review-modal">
            <div className="modal-header"><div><p className="section-kicker">Antes vs. después</p><h2 id="tournament-review-title">Revisión del Standing y créditos</h2></div></div>
            <p className="modal-copy">El Standing fue reconstruido desde sus rondas, mesas y resultados. El crédito consolidado no se modifica sin una confirmación administrativa.</p>
            <div className="financial-difference-list">
              {financialDifferences.map((difference) => <div key={difference.playerKey}><strong>{difference.playerName}</strong><span>Consolidado: {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(difference.consolidated)}</span><span>Teórico: {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(difference.theoretical)}</span><b>Diferencia: {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(difference.difference)}</b></div>)}
            </div>
            {pendingFinancialDifferences.length > 0 && (
              <div className="date-credit-notice is-pending">
                <strong>{pendingFinancialDifferences.length} corrección(es) de crédito pendiente(s)</strong>
                <span>Aumentos: +{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(positiveFinancialDifference)} · Descuentos: −{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(negativeFinancialDifference)}</span>
              </div>
            )}
            {pendingFinancialDifferences.length > 0 && confirmDateCreditCorrection && (
              <div className="date-compensation-confirm">
                <strong>Confirma las correcciones de todos los jugadores</strong>
                <span>Se crearán ajustes positivos y negativos trazables. Si un jugador ya utilizó el crédito, su disponible puede quedar negativo.</span>
                <div>
                  <button className="secondary-button" type="button" onClick={() => setConfirmDateCreditCorrection(false)}>Cancelar</button>
                  <button className="primary-button" type="button" onClick={() => {
                    const error = onApplyDateCreditCorrections()
                    setFeedback(error)
                    if (!error) setConfirmDateCreditCorrection(false)
                  }}>Confirmar correcciones</button>
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setShowFinancialReview(false)}>Cerrar</button>
              {pendingFinancialDifferences.length > 0 && !confirmDateCreditCorrection && <button className="primary-button" type="button" onClick={() => setConfirmDateCreditCorrection(true)}>Corregir créditos</button>}
              <button className="primary-button" type="button" disabled={pendingFinancialDifferences.length > 0} title={pendingFinancialDifferences.length > 0 ? 'Aplica primero todas las correcciones de crédito.' : undefined} onClick={() => { runTournamentChange(resolveTournamentFinancialReview); setShowFinancialReview(false) }}>Marcar revisión como resuelta</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
