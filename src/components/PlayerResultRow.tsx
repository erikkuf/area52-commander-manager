import type {
  AchievementConfig,
  Participant,
  PlayerResult,
  RotatingAchievementConfig,
} from '../domain/tournament'
import type { PlayerResultChanges } from '../domain/results'

interface PlayerResultRowProps {
  player: Participant
  result?: PlayerResult
  achievementConfig: AchievementConfig
  rotatingAchievements: RotatingAchievementConfig[]
  pairingMode?: boolean
  disabled?: boolean
  winDisabled?: boolean
  survivalDisabled?: boolean
  maxEliminations?: number
  onSwap?: () => void
  onChange?: (changes: PlayerResultChanges) => void
}

interface ToggleChipProps {
  label: string
  active: boolean
  accessibleLabel: string
  disabled: boolean
  onToggle: () => void
}

function ToggleChip({
  label,
  active,
  accessibleLabel,
  disabled,
  onToggle,
}: ToggleChipProps) {
  return (
    <button
      className={active ? 'score-toggle is-active' : 'score-toggle'}
      type="button"
      aria-label={accessibleLabel}
      aria-pressed={active}
      disabled={disabled}
      onClick={onToggle}
    >
      {label}
    </button>
  )
}

export function PlayerResultRow({
  player,
  result,
  achievementConfig,
  rotatingAchievements,
  pairingMode = false,
  disabled = false,
  winDisabled = false,
  survivalDisabled = false,
  maxEliminations = 3,
  onSwap,
  onChange,
}: PlayerResultRowProps) {
  const controlsDisabled = disabled || pairingMode || !onChange

  if (player.isGhost) {
    return (
      <div className="player-result-row ghost-player-row">
        <div className="player-identity">
          <span className="player-avatar" aria-hidden="true">GF</span>
          <span className="player-name">
            {player.name}
            <small>Participante auxiliar — sin puntaje</small>
          </span>
          {pairingMode && (
            <button className="swap-player-button" type="button" onClick={onSwap}>Cambiar</button>
          )}
        </div>
        <div className="ghost-player-note">Sin controles competitivos</div>
      </div>
    )
  }

  if (!result) return null

  return (
    <div className={controlsDisabled && !pairingMode ? 'player-result-row is-locked' : 'player-result-row'}>
      <div className="player-identity">
        <span className="player-avatar" aria-hidden="true">
          {player.name
            .split(' ')
            .slice(0, 2)
            .map((part) => part[0])
            .join('')}
        </span>
        <span className="player-name">{player.name}</span>
        {pairingMode && (
          <button className="swap-player-button" type="button" onClick={onSwap}>
            Cambiar
          </button>
        )}
      </div>

      <div className="score-controls" aria-label={`Resultados de ${player.name}`}>
        {rotatingAchievements.map((achievement, index) => {
          const rule = achievementConfig[achievement.id]
          if (!rule?.enabled) return null
          const active = Boolean(result[achievement.id])
          return <ToggleChip
            key={achievement.id}
            label={`R${index + 1}`}
            active={active}
            accessibleLabel={`${player.name}: ${achievement.label}`}
            disabled={controlsDisabled}
            onToggle={() => onChange?.({ [achievement.id]: !active })}
          />
        })}
        {achievementConfig.win.enabled && <ToggleChip
          label="G"
          active={result.wonTable}
          accessibleLabel={`${player.name}: Ganó la mesa`}
          disabled={controlsDisabled || winDisabled}
          onToggle={() => onChange?.({ wonTable: !result.wonTable })}
        />}

        {achievementConfig.elimination.enabled && <div className="eliminations-control" aria-label={`${player.name}: ${result.eliminations} eliminaciones`}>
          <button
            type="button"
            aria-label={`${player.name}: Restar eliminación`}
            disabled={controlsDisabled || result.eliminations === 0}
            onClick={() => onChange?.({ eliminations: result.eliminations - 1 })}
          >
            −
          </button>
          <span>
            <small>KO</small>
            {result.eliminations}
          </span>
          <button
            type="button"
            aria-label={`${player.name}: Sumar eliminación`}
            disabled={controlsDisabled || result.eliminations >= maxEliminations}
            onClick={() => onChange?.({ eliminations: result.eliminations + 1 })}
          >
            +
          </button>
        </div>}

        {achievementConfig.survival.enabled && <ToggleChip
          label="S"
          active={result.survived}
          accessibleLabel={`${player.name}: Sobrevivió`}
          disabled={controlsDisabled || survivalDisabled}
          onToggle={() => onChange?.({ survived: !result.survived })}
        />}
      </div>

      <div className="points-pill" aria-label={`${result.achievementPoints} puntos de logro`}>
        <strong>{result.achievementPoints}</strong>
        <span>pts</span>
      </div>
    </div>
  )
}
