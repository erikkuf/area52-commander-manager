import { useState, type FormEvent } from 'react'
import type { Participant, Round, TournamentStatus } from '../domain/tournament'
import type { ParticipantImportReport } from '../domain/participants'
import { CloseIcon, UsersIcon } from './icons'
import { formatCurrency } from '../utils/format'

export interface LateRegistrationPreview {
  playerNames: string[]
  datePoolIncrease: number
  monthlyPoolIncrease: number
  totalIncrease: number
}

interface DrawerPrizeSummary {
  prizePlayerCount: number
  datePrizePool: number
  monthlyPoolContribution: number
  totalGenerated: number
}

interface PlayersDrawerProps {
  open: boolean
  players: Participant[]
  tournamentStatus: TournamentStatus
  currentRound?: Round
  prizeSummary?: DrawerPrizeSummary
  lateRegistrationPreview?: LateRegistrationPreview | null
  feedback: string | null
  importReport: ParticipantImportReport | null
  onAddPlayers: (names: string) => void
  onRenamePlayer: (participantId: string, name: string) => void
  onRemovePlayer: (participantId: string) => void
  onToggleActive: (participantId: string, active: boolean) => void
  onConfirmLateRegistration: () => void
  onSkipLateRegistration: () => void
  onClose: () => void
}

export function PlayersDrawer({
  open,
  players,
  tournamentStatus,
  currentRound,
  prizeSummary,
  lateRegistrationPreview,
  feedback,
  importReport,
  onAddPlayers,
  onRenamePlayer,
  onRemovePlayer,
  onToggleActive,
  onConfirmLateRegistration,
  onSkipLateRegistration,
  onClose,
}: PlayersDrawerProps) {
  const [singleName, setSingleName] = useState('')
  const [pastedNames, setPastedNames] = useState('')
  const [showBulkInput, setShowBulkInput] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [pendingDropId, setPendingDropId] = useState<string | null>(null)

  if (!open) return null

  const realPlayers = players.filter((player) => !player.isGhost)
  const activeCount = realPlayers.filter((player) => player.active).length
  const pendingDropPlayer = players.find((player) => player.id === pendingDropId)

  const requestActivityChange = (player: Participant) => {
    const isSeatedInActiveRound =
      player.active &&
      currentRound?.status === 'active' &&
      currentRound.tables.some((table) => table.participantIds.includes(player.id))

    if (isSeatedInActiveRound) {
      setPendingDropId(player.id)
      return
    }
    onToggleActive(player.id, !player.active)
  }

  const closeDrawer = () => {
    setPendingDropId(null)
    onClose()
  }

  const handleAddSingle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onAddPlayers(singleName)
    if (singleName.trim()) setSingleName('')
  }

  const handleBulkImport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onAddPlayers(pastedNames)
  }

  const submitRename = (participant: Participant) => {
    onRenamePlayer(participant.id, editingName)
    setEditingId(null)
  }

  return (
    <div className="drawer-layer" role="presentation">
      <button className="drawer-backdrop" type="button" onClick={closeDrawer} aria-label="Cerrar panel" />
      <aside className="players-drawer" role="dialog" aria-label="Jugadores del torneo" aria-modal="true">
        <div className="drawer-header">
          <div>
            <span className="drawer-header__icon"><UsersIcon /></span>
            <div>
              <p>Participantes</p>
              <h2>{realPlayers.length} total · {activeCount} activos</h2>
            </div>
          </div>
          <button className="icon-button" type="button" onClick={closeDrawer} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </div>

        {prizeSummary && (
          <div className="drawer-prize-summary" aria-label="Pozos automáticos de la fecha">
            <div><span>Jugadores para pozo</span><strong>{prizeSummary.prizePlayerCount}</strong></div>
            <div><span>Pozo fecha</span><strong>{formatCurrency.format(prizeSummary.datePrizePool)}</strong></div>
            <div><span>Aporte mensual</span><strong>{formatCurrency.format(prizeSummary.monthlyPoolContribution)}</strong></div>
            <div><span>Total</span><strong>{formatCurrency.format(prizeSummary.totalGenerated)}</strong></div>
          </div>
        )}

        <form className="add-player-form" onSubmit={handleAddSingle}>
          <label className="field">
            <span>Agregar jugador</span>
            <div className="inline-field-action">
              <input
                type="text"
                value={singleName}
                placeholder="Nombre y apellido"
                onChange={(event) => setSingleName(event.target.value)}
              />
              <button className="primary-button" type="submit">Agregar</button>
            </div>
          </label>
        </form>

        <button className="bulk-toggle" type="button" onClick={() => setShowBulkInput(!showBulkInput)}>
          {showBulkInput ? 'Ocultar carga masiva' : 'Pegar lista completa'}
        </button>

        {showBulkInput && (
          <form className="bulk-player-form" onSubmit={handleBulkImport}>
            <label className="field">
              <span>Un jugador por línea</span>
              <textarea
                value={pastedNames}
                placeholder={'Pablo Ortega\nJavier Cisternas\nKevin Arenas'}
                onChange={(event) => setPastedNames(event.target.value)}
              />
            </label>
            <button className="secondary-button" type="submit">Revisar y agregar lista</button>
          </form>
        )}

        {feedback && <div className="form-message form-message--error">{feedback}</div>}
        {pendingDropPlayer && (
          <div className="drop-warning" role="alertdialog" aria-labelledby="drop-warning-title">
            <strong id="drop-warning-title">{pendingDropPlayer.name} ya está sentado en esta ronda</strong>
            <span>
              El DROP se aplicará a las rondas futuras. Su mesa y sus resultados de la ronda actual
              no se modificarán.
            </span>
            <div>
              <button className="secondary-button" type="button" onClick={() => setPendingDropId(null)}>
                Cancelar
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={() => {
                  onToggleActive(pendingDropPlayer.id, false)
                  setPendingDropId(null)
                }}
              >
                Confirmar DROP
              </button>
            </div>
          </div>
        )}
        {lateRegistrationPreview && (
          <div className="late-registration-warning" role="alertdialog" aria-labelledby="late-registration-title">
            <strong id="late-registration-title">
              {lateRegistrationPreview.playerNames.length === 1
                ? 'Jugador agregado'
                : `${lateRegistrationPreview.playerNames.length} jugadores agregados`}
            </strong>
            <span>{lateRegistrationPreview.playerNames.join(', ')}</span>
            <dl>
              <div><dt>Aumento pozo fecha</dt><dd>+{formatCurrency.format(lateRegistrationPreview.datePoolIncrease)}</dd></div>
              <div><dt>Aumento pozo mensual</dt><dd>+{formatCurrency.format(lateRegistrationPreview.monthlyPoolIncrease)}</dd></div>
              <div><dt>Aumento total</dt><dd>+{formatCurrency.format(lateRegistrationPreview.totalIncrease)}</dd></div>
            </dl>
            <p>El jugador ya fue agregado. Confirma si debe aportar a los pozos de esta fecha.</p>
            <div>
              <button className="secondary-button" type="button" onClick={onSkipLateRegistration}>
                Mantener pozos
              </button>
              <button className="primary-button" type="button" onClick={onConfirmLateRegistration}>
                Confirmar aporte
              </button>
            </div>
          </div>
        )}
        {importReport && (
          <div className="import-report" aria-live="polite">
            <strong>{importReport.added} jugador(es) agregado(s).</strong>
            {importReport.blankLineNumbers.length > 0 && (
              <span>Líneas vacías omitidas: {importReport.blankLineNumbers.join(', ')}.</span>
            )}
            {importReport.duplicateNames.length > 0 && (
              <span>Duplicados en la lista: {importReport.duplicateNames.join(', ')}.</span>
            )}
            {importReport.existingNames.length > 0 && (
              <span>Ya registrados: {importReport.existingNames.join(', ')}.</span>
            )}
          </div>
        )}

        {realPlayers.length === 0 ? (
          <div className="empty-player-list">
            <UsersIcon />
            <strong>Aún no hay jugadores</strong>
            <span>Agrega uno o pega una lista completa.</span>
          </div>
        ) : (
          <ol className="player-list">
            {realPlayers.map((player, index) => (
              <li className={!player.active ? 'is-dropped' : ''} key={player.id}>
                <span className="player-list__number">{String(index + 1).padStart(2, '0')}</span>
                <span className="player-list__avatar">{player.name.slice(0, 1)}</span>
                {editingId === player.id ? (
                  <div className="player-edit-control">
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') submitRename(player)
                        if (event.key === 'Escape') setEditingId(null)
                      }}
                    />
                    <button type="button" onClick={() => submitRename(player)}>Guardar</button>
                  </div>
                ) : (
                  <div className="player-list__name">
                    <strong>{player.name}</strong>
                    <span className={player.active ? 'active-label' : 'drop-label'}>
                      {player.active ? 'Activo' : 'DROP'}
                    </span>
                  </div>
                )}
                <div className="player-list__actions">
                  {editingId !== player.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(player.id)
                        setEditingName(player.name)
                      }}
                    >
                      Editar
                    </button>
                  )}
                  {tournamentStatus === 'setup' ? (
                    <button className="danger-text-button" type="button" onClick={() => onRemovePlayer(player.id)}>
                      Eliminar
                    </button>
                  ) : (
                    <button
                      className={player.active ? 'danger-text-button' : 'reactivate-button'}
                      type="button"
                      onClick={() => requestActivityChange(player)}
                    >
                      {player.active ? 'DROP' : 'Reactivar'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  )
}
