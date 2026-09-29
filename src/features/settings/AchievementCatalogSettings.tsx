import { useState, type FormEvent } from 'react'
import {
  createLeagueAchievementDefinition,
  createRotatingAchievementDefinition,
  createTournamentPenaltyDefinition,
  deleteCatalogDefinition,
  updateLeagueAchievementDefinition,
  updateRotatingAchievementDefinition,
  updateTournamentPenaltyDefinition,
} from '../../domain/achievementCatalogs'
import type {
  LeagueAchievementDefinition,
  RotatingAchievementDefinition,
  TournamentPenaltyDefinition,
} from '../../domain/tournament'

interface AchievementCatalogSettingsProps {
  rotatingCatalog: RotatingAchievementDefinition[]
  leagueCatalog: LeagueAchievementDefinition[]
  penaltyCatalog: TournamentPenaltyDefinition[]
  onRotatingCatalogChange: (catalog: RotatingAchievementDefinition[]) => void
  onLeagueCatalogChange: (catalog: LeagueAchievementDefinition[]) => void
  onPenaltyCatalogChange: (catalog: TournamentPenaltyDefinition[]) => void
}

type CatalogKind = 'rotating' | 'league' | 'penalty'
type EditingDefinition = {
  kind: CatalogKind
  id?: string
  name: string
  description: string
  points: number
  active: boolean
}

const emptyDraft = (kind: CatalogKind): EditingDefinition => ({
  kind,
  name: '',
  description: '',
  points: kind === 'penalty' ? -1 : 1,
  active: true,
})

function pointsLabel(points: number): string {
  return `${points > 0 ? '+' : ''}${points}`
}

export function AchievementCatalogSettings({
  rotatingCatalog,
  leagueCatalog,
  penaltyCatalog,
  onRotatingCatalogChange,
  onLeagueCatalogChange,
  onPenaltyCatalogChange,
}: AchievementCatalogSettingsProps) {
  const [editing, setEditing] = useState<EditingDefinition | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!editing) return
    try {
      const draft = {
        name: editing.name,
        description: editing.description,
        points: editing.points,
        active: editing.active,
      }
      if (editing.kind === 'rotating') {
        onRotatingCatalogChange(editing.id
          ? updateRotatingAchievementDefinition(rotatingCatalog, editing.id, draft)
          : [...rotatingCatalog, createRotatingAchievementDefinition(draft)])
      } else if (editing.kind === 'league') {
        onLeagueCatalogChange(editing.id
          ? updateLeagueAchievementDefinition(leagueCatalog, editing.id, draft)
          : [...leagueCatalog, createLeagueAchievementDefinition(draft)])
      } else {
        onPenaltyCatalogChange(editing.id
          ? updateTournamentPenaltyDefinition(penaltyCatalog, editing.id, draft)
          : [...penaltyCatalog, createTournamentPenaltyDefinition(draft)])
      }
      setEditing(null)
      setError(null)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo guardar la definición.')
    }
  }

  const renderCatalog = (
    kind: CatalogKind,
    title: string,
    description: string,
    definitions: Array<RotatingAchievementDefinition | LeagueAchievementDefinition | TournamentPenaltyDefinition>,
  ) => (
    <section className="achievement-catalog-card">
      <div className="section-heading">
        <div><p className="section-kicker">Catálogo</p><h2>{title}</h2><p>{description}</p></div>
        <button className="secondary-button" type="button" onClick={() => setEditing(emptyDraft(kind))}>
          + Crear definición
        </button>
      </div>
      {definitions.length === 0 ? (
        <div className="global-empty-state global-empty-state--card"><p>El catálogo todavía no tiene definiciones.</p></div>
      ) : (
        <div className="achievement-catalog-list">
          {definitions.map((definition) => (
            <article className={!definition.active ? 'achievement-catalog-item is-inactive' : 'achievement-catalog-item'} key={definition.id}>
              <div>
                <span className={`points-tag ${definition.points < 0 ? 'is-negative' : 'is-positive'}`}>
                  {pointsLabel(definition.points)}
                </span>
                <strong>{definition.name}</strong>
                <p>{definition.description || 'Sin descripción.'}</p>
              </div>
              <div className="catalog-item-actions">
                <span className={`state-pill state-pill--${definition.active ? 'active' : 'finished'}`}>
                  {definition.active ? 'Activa' : 'Inactiva'}
                </span>
                <button className="text-button" type="button" onClick={() => setEditing({
                  kind,
                  id: definition.id,
                  name: definition.name,
                  description: definition.description,
                  points: definition.points,
                  active: definition.active,
                })}>Editar</button>
                <button className="text-button" type="button" onClick={() => {
                  const draft = { ...definition, active: !definition.active }
                  if (kind === 'rotating') {
                    onRotatingCatalogChange(updateRotatingAchievementDefinition(
                      rotatingCatalog, definition.id, draft,
                    ))
                  } else if (kind === 'league') {
                    onLeagueCatalogChange(updateLeagueAchievementDefinition(
                      leagueCatalog, definition.id, draft,
                    ))
                  } else {
                    onPenaltyCatalogChange(updateTournamentPenaltyDefinition(
                      penaltyCatalog, definition.id, draft,
                    ))
                  }
                }}>{definition.active ? 'Desactivar' : 'Reactivar'}</button>
                <button className="text-button" type="button" onClick={() => {
                  if (!window.confirm(
                    `¿Eliminar permanentemente «${definition.name}» del catálogo? Los usos históricos y sus snapshots se conservarán sin cambios. Desactivar es la alternativa reversible.`,
                  )) return
                  if (kind === 'rotating') onRotatingCatalogChange(deleteCatalogDefinition(rotatingCatalog, definition.id))
                  else if (kind === 'league') onLeagueCatalogChange(deleteCatalogDefinition(leagueCatalog, definition.id))
                  else onPenaltyCatalogChange(deleteCatalogDefinition(penaltyCatalog, definition.id))
                }}>Eliminar</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )

  return (
    <>
      {renderCatalog(
        'rotating',
        'Logros Rotativos',
        'Definiciones para mesas y fechas. Cada evento conserva su propio snapshot.',
        rotatingCatalog,
      )}
      {renderCatalog(
        'league',
        'Logros y Penalizaciones de Liga',
        'Ajustes que afectan únicamente el Leaderboard de la liga.',
        leagueCatalog,
      )}
      {renderCatalog(
        'penalty',
        'Penalizaciones de Fecha',
        'Ajustes administrativos negativos del Standing. No ocupan espacios de logros rotativos.',
        penaltyCatalog,
      )}

      {editing && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="achievement-definition-title">
          <button className="modal-backdrop" type="button" aria-label="Cerrar" onClick={() => setEditing(null)} />
          <form className="swap-modal" onSubmit={submit}>
            <div className="modal-header">
              <div><p className="section-kicker">Catálogo</p><h2 id="achievement-definition-title">{editing.id ? 'Editar' : 'Crear'} definición</h2></div>
              <button className="drawer-close" type="button" onClick={() => setEditing(null)}>×</button>
            </div>
            <label className="field"><span>Nombre</span><input required value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
            <label className="field"><span>Descripción</span><textarea value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></label>
            <label className="field"><span>{editing.kind === 'penalty' ? 'Puntos (entero negativo)' : 'Puntos (+ logro / − penalización)'}</span><input required step="1" type="number" max={editing.kind === 'penalty' ? -1 : undefined} value={editing.points} onChange={(event) => setEditing({ ...editing, points: Number(event.target.value) })} /></label>
            <label className="switch-field"><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} /><span>Disponible para nuevas selecciones</span></label>
            {error && <div className="form-message form-message--error">{error}</div>}
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setEditing(null)}>Cancelar</button><button className="primary-button" type="submit">Guardar</button></div>
          </form>
        </div>
      )}
    </>
  )
}
