import { DomainError } from './errors'
import type { LeaguePrizeLedger, Tournament } from './tournament'
import type { AppWorkspace } from './workspace'

export function assessTournamentDeletion(
  tournament: Tournament,
  ledger: LeaguePrizeLedger,
): { allowed: boolean; reason?: string } {
  if (tournament.rounds.length > 0 || tournament.currentRound !== 0) {
    return { allowed: false, reason: 'No se puede eliminar porque el evento ya tiene historial de emparejamientos.' }
  }
  if (tournament.status !== 'setup' || tournament.finishedAt) {
    return { allowed: false, reason: 'Solo se pueden eliminar eventos en preparación, antes de generar la primera ronda.' }
  }
  if (tournament.penaltyMovements.length > 0 || tournament.administrativeStandingParticipantIds?.length) {
    return { allowed: false, reason: 'No se puede eliminar porque el evento ya tiene historial competitivo.' }
  }
  if (ledger.creditMovements.some((movement) => movement.tournamentId === tournament.id) ||
    ledger.contributions.some((contribution) => contribution.tournamentId === tournament.id &&
      (contribution.status === 'finalized' || contribution.finalizedAt))) {
    return { allowed: false, reason: 'No se puede eliminar porque existen movimientos financieros o aportes consolidados asociados.' }
  }
  if (tournament.leaguePeriodId && ledger.leaguePeriods.some((period) =>
    period.id === tournament.leaguePeriodId && period.status === 'finished')) {
    return { allowed: false, reason: 'No se puede eliminar una fecha perteneciente a una liga finalizada.' }
  }
  return { allowed: true }
}

/** Solo elimina preparación: nunca elimina movimientos, identidades globales ni otras fechas. */
export function deleteSetupTournament(
  workspace: AppWorkspace,
  ledger: LeaguePrizeLedger,
  tournamentId: string,
): { workspace: AppWorkspace; ledger: LeaguePrizeLedger } {
  const tournament = workspace.tournaments.find((item) => item.id === tournamentId)
  if (!tournament) throw new DomainError('No se encontró el evento que quieres eliminar.')
  const assessment = assessTournamentDeletion(tournament, ledger)
  if (!assessment.allowed) throw new DomainError(assessment.reason!)
  const opened = workspace.navigation.openedTournamentId === tournamentId
  return {
    workspace: {
      ...workspace,
      tournaments: workspace.tournaments.filter((item) => item.id !== tournamentId),
      navigation: opened ? {
        ...workspace.navigation,
        openedTournamentId: undefined,
        creationType: undefined,
        globalSection: tournament.leaguePeriodId ? 'leagues' : 'events',
        selectedLeaguePeriodId: tournament.leaguePeriodId,
        leagueDetailTab: 'dates',
      } : workspace.navigation,
    },
    ledger: {
      ...ledger,
      // La asociación con LeaguePeriod vive en Tournament.leaguePeriodId, no en una lista duplicada.
      contributions: ledger.contributions.filter((item) => item.tournamentId !== tournamentId),
    },
  }
}
