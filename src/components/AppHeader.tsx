import type { Tournament } from '../domain/tournament'
import { formatTournamentDate } from '../utils/format'
import { CalendarIcon, UsersIcon } from './icons'

interface AppHeaderProps {
  tournament: Tournament
  storageStatus: 'saving' | 'saved' | 'error'
  onOpenPlayers: () => void
}

const statusLabels = {
  saving: 'Guardando…',
  saved: 'Guardado local',
  error: 'Error al guardar',
}

export function AppHeader({ tournament, storageStatus, onOpenPlayers }: AppHeaderProps) {
  const activePlayers = tournament.participants.filter(
    (participant) => participant.active && !participant.isGhost,
  ).length
  const tournamentStatusLabel =
    tournament.status === 'setup'
      ? 'Configuración inicial'
      : tournament.status === 'finished'
        ? 'Torneo finalizado'
        : tournament.status === 'rounds_completed'
          ? 'Rondas completadas'
        : 'Torneo activo'

  return (
    <header className="app-header">
      <div className="app-header__topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            A<span>52</span>
          </span>
          <div>
            <p className="brand__eyebrow">ÁREA 52</p>
            <p className="brand__title">Commander Manager</p>
          </div>
        </div>

        <button className="players-button" type="button" onClick={onOpenPlayers}>
          <UsersIcon />
          <span>{activePlayers} jugadores</span>
        </button>
      </div>

      <div className="tournament-strip">
        <div className="tournament-strip__identity">
          <p className="tournament-strip__label">{tournamentStatusLabel}</p>
          <h1>{tournament.name}</h1>
          <span className="tournament-date">
            <CalendarIcon /> {formatTournamentDate(tournament.date)}
          </span>
        </div>

        <div className="tournament-stats" aria-label="Estado del torneo">
          <div className="stat-block">
            <span>Ronda</span>
            <strong>
              {tournament.currentRound || '—'} <small>/ {tournament.totalRounds}</small>
            </strong>
          </div>
          <div className="stat-block">
            <span>Activos</span>
            <strong>{activePlayers}</strong>
          </div>
          <div className={`demo-status demo-status--${storageStatus}`}>
            <span className="demo-status__dot" />
            {statusLabels[storageStatus]}
          </div>
        </div>
      </div>
    </header>
  )
}
