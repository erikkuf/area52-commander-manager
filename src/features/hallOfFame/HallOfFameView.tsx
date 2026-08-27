import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  assessChampionSnapshotReadiness,
  assessOfficialChampionUpdateReadiness,
  createMissingLeagueChampionSnapshot,
  currentChampionDiffers,
  updateChampionSnapshotMetadata,
  updateOfficialLeagueChampion,
} from '../../domain/hallOfFame'
import {
  buildLeagueLeaderboard,
  buildTheoreticalLeagueLeaderboard,
} from '../../domain/league'
import type {
  ChampionPhotoReference,
  LeagueChampionSnapshot,
  LeaguePrizeLedger,
  Tournament,
} from '../../domain/tournament'
import {
  validateChampionPhotoFile,
  type ChampionPhotoFile,
  type ChampionPhotoStorage,
} from '../../services/championPhotoStorage'
import { formatTournamentDate } from '../../utils/format'

interface HallOfFameViewProps {
  tournaments: Tournament[]
  ledger: LeaguePrizeLedger
  photoStorage: ChampionPhotoStorage
  initialEditLeaguePeriodId?: string
  onInitialEditHandled: () => void
  onLedgerChange: (ledger: LeaguePrizeLedger) => void
  onOpenLeague: (leaguePeriodId: string) => void
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la acción.'
}

function ChampionPhoto({
  reference,
  photoStorage,
  alt,
}: {
  reference?: ChampionPhotoReference
  photoStorage: ChampionPhotoStorage
  alt: string
}) {
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    if (!reference) {
      setPreview(null)
      return () => { active = false }
    }
    photoStorage.getPreview(reference).then((url) => {
      if (!active) {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
        return
      }
      objectUrl = url
      setPreview(url)
    }).catch(() => setPreview(null))
    return () => {
      active = false
      if (objectUrl?.startsWith('blob:')) URL.revokeObjectURL(objectUrl)
    }
  }, [photoStorage, reference])

  return preview
    ? <img className="champion-photo" src={preview} alt={alt} />
    : <div className="champion-photo champion-photo--placeholder" aria-label="Campeón sin foto"><span>1</span><small>CAMPEÓN</small></div>
}

export function HallOfFameView({
  tournaments,
  ledger,
  photoStorage,
  initialEditLeaguePeriodId,
  onInitialEditHandled,
  onLedgerChange,
  onOpenLeague,
}: HallOfFameViewProps) {
  const snapshots = useMemo(
    () => [...ledger.championSnapshots].sort((first, second) =>
      (second.sourceClosedAt ?? second.createdAt).localeCompare(
        first.sourceClosedAt ?? first.createdAt,
      )),
    [ledger.championSnapshots],
  )
  const missingPeriods = ledger.leaguePeriods
    .filter((period) => period.status === 'finished')
    .filter((period) => !ledger.championSnapshots.some(
      (snapshot) => snapshot.leaguePeriodId === period.id,
    ))
  const [detailSnapshot, setDetailSnapshot] = useState<LeagueChampionSnapshot | null>(null)
  const [editSnapshot, setEditSnapshot] = useState<LeagueChampionSnapshot | null>(null)
  const [officialUpdate, setOfficialUpdate] = useState<LeagueChampionSnapshot | null>(null)
  const [photoDisposition, setPhotoDisposition] = useState<'delete' | 'keep'>('delete')
  const [commanderName, setCommanderName] = useState('')
  const [deckName, setDeckName] = useState('')
  const [deckUrl, setDeckUrl] = useState('')
  const [photoFile, setPhotoFile] = useState<ChampionPhotoFile | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const openEditor = (snapshot: LeagueChampionSnapshot) => {
    setEditSnapshot(snapshot)
    setCommanderName(snapshot.commanderName ?? '')
    setDeckName(snapshot.deckName ?? '')
    setDeckUrl(snapshot.deckUrl ?? '')
    setPhotoFile(null)
    setPhotoPreview(null)
    setRemovePhoto(false)
    setError(null)
  }

  const closeEditor = () => {
    setEditSnapshot(null)
    setPhotoFile(null)
    setPhotoPreview(null)
    setRemovePhoto(false)
    setError(null)
  }

  useEffect(() => {
    if (!initialEditLeaguePeriodId) return
    const snapshot = ledger.championSnapshots.find(
      (item) => item.leaguePeriodId === initialEditLeaguePeriodId,
    )
    if (snapshot) openEditor(snapshot)
    onInitialEditHandled()
  }, [initialEditLeaguePeriodId, ledger.championSnapshots, onInitialEditHandled])

  useEffect(() => () => {
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  const selectPhoto = (file?: File) => {
    if (!file) return
    try {
      validateChampionPhotoFile(file)
      setPhotoFile(file)
      setRemovePhoto(false)
      setError(null)
      setPhotoPreview(URL.createObjectURL(file))
    } catch (photoError) {
      setPhotoFile(null)
      setPhotoPreview(null)
      setError(messageFromError(photoError))
    }
  }

  const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editSnapshot) return
    try {
      let championPhoto = editSnapshot.championPhoto
      if (photoFile) {
        championPhoto = await photoStorage.save(editSnapshot.id, photoFile)
      } else if (removePhoto && championPhoto) {
        await photoStorage.remove(championPhoto)
        championPhoto = undefined
      }
      onLedgerChange(updateChampionSnapshotMetadata(
        ledger,
        editSnapshot.id,
        { championPhoto, commanderName, deckName, deckUrl },
      ))
      closeEditor()
      setFeedback('Registro del campeón actualizado.')
      setError(null)
    } catch (saveError) {
      setError(messageFromError(saveError))
    }
  }

  const generateHistoricSnapshot = (leaguePeriodId: string) => {
    const period = ledger.leaguePeriods.find((item) => item.id === leaguePeriodId)
    if (!period) return
    try {
      const standings = buildLeagueLeaderboard(tournaments, period, ledger)
      onLedgerChange(createMissingLeagueChampionSnapshot(
        ledger,
        period,
        standings,
        tournaments,
      ))
      setFeedback(`Registro histórico generado para ${period.name}.`)
      setError(null)
    } catch (generationError) {
      setError(messageFromError(generationError))
    }
  }

  const confirmOfficialUpdate = async () => {
    if (!officialUpdate) return
    const period = ledger.leaguePeriods.find(
      (item) => item.id === officialUpdate.leaguePeriodId,
    )
    if (!period) return
    try {
      const standings = buildTheoreticalLeagueLeaderboard(tournaments, period, ledger)
      const updatedLedger = updateOfficialLeagueChampion(
        ledger,
        officialUpdate.id,
        period,
        standings,
        tournaments,
      )
      if (officialUpdate.championPhoto && photoDisposition === 'delete') {
        await photoStorage.remove(officialUpdate.championPhoto)
      }
      onLedgerChange(updatedLedger)
      setOfficialUpdate(null)
      setFeedback('El campeón oficial fue actualizado. Los créditos no fueron modificados.')
      setError(null)
    } catch (updateError) {
      setError(messageFromError(updateError))
    }
  }

  return (
    <section className="global-page hall-of-fame-page" aria-labelledby="hall-of-fame-title">
      <div className="global-page__heading hall-of-fame-heading">
        <div>
          <p className="section-kicker">Archivo de campeones</p>
          <h1 id="hall-of-fame-title">Hall of Fame</h1>
          <p>Los campeones oficiales se conservan como registros históricos independientes del Leaderboard actual.</p>
        </div>
      </div>

      {feedback && <div className="form-message form-message--success">{feedback}</div>}
      {error && <div className="form-message form-message--error">{error}</div>}

      {missingPeriods.length > 0 && (
        <section className="hall-pending-panel" aria-labelledby="pending-hall-title">
          <div><p className="section-kicker">Migración histórica</p><h2 id="pending-hall-title">Registros pendientes</h2></div>
          {missingPeriods.map((period) => {
            const standings = buildLeagueLeaderboard(tournaments, period, ledger)
            const readiness = assessChampionSnapshotReadiness(period, standings, tournaments)
            return (
              <article key={period.id}>
                <div><strong>{period.name}</strong><small>{readiness.message ?? 'Listo para generar.'}</small></div>
                <button className="secondary-button" type="button" disabled={!readiness.ready} onClick={() => generateHistoricSnapshot(period.id)}>Generar registro</button>
              </article>
            )
          })}
        </section>
      )}

      {snapshots.length === 0 ? (
        <div className="global-empty-state global-empty-state--card hall-empty-state">
          <strong>Todavía no hay campeones registrados.</strong>
          <p>Los ganadores aparecerán aquí cuando finalices una liga.</p>
        </div>
      ) : (
        <div className="hall-grid">
          {snapshots.map((snapshot) => {
            const period = ledger.leaguePeriods.find(
              (item) => item.id === snapshot.leaguePeriodId,
            )
            const standings = period
              ? buildTheoreticalLeagueLeaderboard(tournaments, period, ledger)
              : []
            const updateReadiness = period
              ? assessOfficialChampionUpdateReadiness(period, standings, tournaments)
              : undefined
            const changedChampion = Boolean(
              updateReadiness?.ready && currentChampionDiffers(snapshot, standings),
            )
            return (
              <article className="champion-card" key={snapshot.id}>
                <div className="champion-card__media">
                  <ChampionPhoto reference={snapshot.championPhoto} photoStorage={photoStorage} alt={`Foto de ${snapshot.playerName}`} />
                  <span className="champion-rank">#1</span>
                </div>
                <div className="champion-card__content">
                  <p className="champion-league">{snapshot.leagueName}</p>
                  <h2>{snapshot.playerName}</h2>
                  <p className="champion-date">Coronado {formatTournamentDate((snapshot.sourceClosedAt ?? snapshot.createdAt).slice(0, 10))}</p>
                  {period?.financialReviewRequired && <span className="review-pill">Liga con revisión pendiente</span>}
                  <dl className="champion-stats">
                    <div><dt>Puntos liga</dt><dd>{snapshot.leaguePoints}</dd></div>
                    <div><dt>Logros</dt><dd>{snapshot.achievementPoints}</dd></div>
                    <div><dt>Especiales</dt><dd>{snapshot.specialLeaguePoints}</dd></div>
                    <div><dt>Fechas</dt><dd>{snapshot.tournamentsPlayed}</dd></div>
                  </dl>
                  {(snapshot.commanderName || snapshot.deckName) && (
                    <div className="champion-deck-summary">
                      {snapshot.commanderName && <span>Comandante · <strong>{snapshot.commanderName}</strong></span>}
                      {snapshot.deckName && <span>Mazo · <strong>{snapshot.deckName}</strong></span>}
                    </div>
                  )}
                  {changedChampion && (
                    <div className="champion-change-warning">
                      <strong>⚠ El resultado cambió después del cierre</strong>
                      <span>Actual: {standings[0]?.playerName}</span>
                      <button type="button" onClick={() => { setOfficialUpdate(snapshot); setPhotoDisposition('delete'); setError(null) }}>Actualizar campeón oficial</button>
                    </div>
                  )}
                  {updateReadiness?.reason === 'unresolved_tie' && (
                    <div className="champion-change-warning">
                      <strong>⚠ Empate teórico sin resolver</strong>
                      <span>{updateReadiness.message}</span>
                    </div>
                  )}
                  <div className="champion-card__actions">
                    <button className="secondary-button" type="button" onClick={() => onOpenLeague(snapshot.leaguePeriodId)}>Ver Liga</button>
                    <button className="secondary-button" type="button" onClick={() => setDetailSnapshot(snapshot)}>Ver detalle</button>
                    <button className="text-button" type="button" onClick={() => openEditor(snapshot)}>Editar registro</button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {detailSnapshot && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="champion-detail-title">
          <button className="modal-backdrop" type="button" aria-label="Cerrar" onClick={() => setDetailSnapshot(null)} />
          <section className="swap-modal champion-detail-modal">
            <div className="modal-header"><div><p className="section-kicker">Campeón oficial</p><h2 id="champion-detail-title">{detailSnapshot.playerName}</h2></div><button className="drawer-close" type="button" onClick={() => setDetailSnapshot(null)}>×</button></div>
            <ChampionPhoto reference={detailSnapshot.championPhoto} photoStorage={photoStorage} alt={`Foto de ${detailSnapshot.playerName}`} />
            <p className="modal-copy">{detailSnapshot.leagueName}</p>
            <dl className="champion-detail-stats">
              <div><dt>Puntos de liga</dt><dd>{detailSnapshot.leaguePoints}</dd></div>
              <div><dt>Logros</dt><dd>{detailSnapshot.achievementPoints}</dd></div>
              <div><dt>Puntos especiales</dt><dd>{detailSnapshot.specialLeaguePoints}</dd></div>
              <div><dt>Victorias de mesa</dt><dd>{detailSnapshot.tableWins}</dd></div>
              <div><dt>Eliminaciones</dt><dd>{detailSnapshot.eliminations}</dd></div>
              <div><dt>Fechas jugadas</dt><dd>{detailSnapshot.tournamentsPlayed}</dd></div>
            </dl>
            {detailSnapshot.commanderName && <p><strong>Comandante:</strong> {detailSnapshot.commanderName}</p>}
            {detailSnapshot.deckName && <p><strong>Mazo:</strong> {detailSnapshot.deckName}</p>}
            {detailSnapshot.deckUrl && <p><a href={detailSnapshot.deckUrl} target="_blank" rel="noreferrer">Abrir decklist</a></p>}
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setDetailSnapshot(null)}>Cerrar</button></div>
          </section>
        </div>
      )}

      {editSnapshot && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="edit-champion-title">
          <button className="modal-backdrop" type="button" aria-label="Cerrar" onClick={closeEditor} />
          <form className="swap-modal champion-edit-modal" onSubmit={saveRecord}>
            <div className="modal-header"><div><p className="section-kicker">Metadata histórica</p><h2 id="edit-champion-title">Editar · {editSnapshot.playerName}</h2></div><button className="drawer-close" type="button" aria-label="Cerrar editor" onClick={closeEditor}>×</button></div>
            <div className="champion-photo-editor">
              {photoPreview ? <img className="champion-photo" src={photoPreview} alt="Vista previa de la nueva foto" /> : <ChampionPhoto reference={removePhoto ? undefined : editSnapshot.championPhoto} photoStorage={photoStorage} alt={`Foto de ${editSnapshot.playerName}`} />}
              <div><label className="secondary-button champion-file-button">{editSnapshot.championPhoto ? 'Reemplazar foto' : 'Subir foto'}<input accept="image/jpeg,image/png,image/webp" type="file" onChange={(event) => { selectPhoto(event.target.files?.[0]); event.target.value = '' }} /></label>{editSnapshot.championPhoto && !removePhoto && !photoFile && <button className="danger-outline-button" type="button" onClick={() => setRemovePhoto(true)}>Eliminar foto</button>}{removePhoto && <button className="secondary-button" type="button" onClick={() => setRemovePhoto(false)}>Conservar foto</button>}<small>JPEG, PNG o WebP · máximo 5 MB</small></div>
            </div>
            <label className="field"><span>Comandante</span><input value={commanderName} onChange={(event) => setCommanderName(event.target.value)} placeholder="Ej. Muldrotha, the Gravetide" /></label>
            <label className="field"><span>Nombre del mazo</span><input value={deckName} onChange={(event) => setDeckName(event.target.value)} placeholder="Opcional" /></label>
            <label className="field"><span>Decklist</span><input type="url" value={deckUrl} onChange={(event) => setDeckUrl(event.target.value)} placeholder="https://…" /></label>
            {error && <div className="form-message form-message--error">{error}</div>}
            <p className="field-help">Estos campos no modifican resultados, Leaderboard ni movimientos de crédito.</p>
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={closeEditor}>Cancelar</button><button className="primary-button" type="submit">Guardar registro</button></div>
          </form>
        </div>
      )}

      {officialUpdate && (() => {
        const period = ledger.leaguePeriods.find((item) => item.id === officialUpdate.leaguePeriodId)
        const standings = period
          ? buildTheoreticalLeagueLeaderboard(tournaments, period, ledger)
          : []
        const readiness = period
          ? assessOfficialChampionUpdateReadiness(period, standings, tournaments)
          : { ready: false, message: 'No se encontró la liga del campeón.' }
        return (
          <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="official-champion-title">
            <button className="modal-backdrop" type="button" aria-label="Cancelar" onClick={() => setOfficialUpdate(null)} />
            <section className="swap-modal official-champion-modal">
              <div className="modal-header"><div><p className="section-kicker">Acción administrativa</p><h2 id="official-champion-title">Actualizar campeón oficial</h2></div></div>
              <p className="modal-copy">Esta acción modificará el registro histórico del Hall of Fame. No moverá créditos automáticamente.</p>
              <div className="champion-before-after"><div><span>Antes</span><strong>{officialUpdate.playerName}</strong></div><div><span>Después</span><strong>{standings[0]?.playerName ?? 'Sin campeón'}</strong></div></div>
              {!readiness.ready && <p className="form-message form-message--error">{readiness.message}</p>}
              {officialUpdate.championPhoto && (
                <fieldset className="photo-disposition"><legend>Foto del campeón anterior</legend><label><input checked={photoDisposition === 'delete'} name="photo-disposition" type="radio" onChange={() => setPhotoDisposition('delete')} /> Eliminar archivo local</label><label><input checked={photoDisposition === 'keep'} name="photo-disposition" type="radio" onChange={() => setPhotoDisposition('keep')} /> Conservar archivo sin asociarlo</label></fieldset>
              )}
              <p className="form-message form-message--error">El nuevo campeón comenzará sin foto ni metadata de mazo.</p>
              <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setOfficialUpdate(null)}>Cancelar</button><button className="danger-button" type="button" disabled={!readiness.ready} onClick={confirmOfficialUpdate}>Confirmar actualización</button></div>
            </section>
          </div>
        )
      })()}
    </section>
  )
}
