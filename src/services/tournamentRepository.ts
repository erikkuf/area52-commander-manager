import type { Tournament } from '../domain/tournament'

export interface TournamentRepository {
  getCurrentTournament(): Promise<Tournament | null>
  saveTournament(tournament: Tournament): Promise<void>
  clearCurrentTournament(): Promise<void>
}
