import {
  MAX_SELECTED_ROTATING_ACHIEVEMENTS,
  snapshotRotatingAchievement,
} from '../domain/achievementCatalogs'
import type {
  RotatingAchievementDefinition,
  TournamentRotatingAchievementSnapshot,
} from '../domain/tournament'

interface RotatingAchievementSelectorProps {
  catalog: RotatingAchievementDefinition[]
  value: TournamentRotatingAchievementSnapshot[]
  onChange: (value: TournamentRotatingAchievementSnapshot[]) => void
}

function pointsLabel(points: number): string {
  return `${points > 0 ? '+' : ''}${points}`
}

export function RotatingAchievementSelector({
  catalog,
  value,
  onChange,
}: RotatingAchievementSelectorProps) {
  const selectedIds = new Set(value.map((snapshot) => snapshot.sourceDefinitionId ?? snapshot.id))
  const activeDefinitions = catalog.filter((definition) => definition.active)
  const addLabel = value.length < 3
    ? 'Agregar logro rotativo'
    : value.length === 3
      ? 'Agregar cuarto logro'
      : 'Agregar quinto logro'

  return (
    <div className="rotating-selector">
      <div className="achievement-fields">
        {value.map((snapshot, index) => {
          const currentDefinitionId = snapshot.sourceDefinitionId ?? snapshot.id
          return (
            <div className="rotating-achievement-row rotating-achievement-row--catalog" key={snapshot.id}>
              <label className="field">
                <span>Rotativo {index + 1}</span>
                <select
                  value="__snapshot__"
                  onChange={(event) => {
                    if (event.target.value === '__snapshot__') return
                    const definition = catalog.find((item) => item.id === event.target.value)
                    if (!definition) return
                    onChange(value.map((item, itemIndex) =>
                      itemIndex === index ? snapshotRotatingAchievement(definition) : item,
                    ))
                  }}
                >
                  <option value="__snapshot__">
                    {snapshot.name} · {pointsLabel(snapshot.points)}
                    {!snapshot.sourceDefinitionId ? ' · histórico' : ' · snapshot'}
                  </option>
                  {activeDefinitions.map((definition) => (
                    <option
                      key={definition.id}
                      value={definition.id}
                      disabled={definition.id !== currentDefinitionId && selectedIds.has(definition.id)}
                    >
                      {definition.name} · {pointsLabel(definition.points)}
                    </option>
                  ))}
                </select>
              </label>
              <details className="achievement-description">
                <summary>Ver detalle</summary>
                <p>{snapshot.description || 'Sin descripción.'}</p>
                <strong className={snapshot.points < 0 ? 'negative-points' : 'positive-points'}>
                  {pointsLabel(snapshot.points)} puntos
                </strong>
              </details>
              {value.length > 3 && (
                <button
                  className="remove-position-button"
                  type="button"
                  onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                >
                  Quitar
                </button>
              )}
            </div>
          )
        })}
      </div>
      {value.length < MAX_SELECTED_ROTATING_ACHIEVEMENTS ? (
        <button
          className="text-button"
          type="button"
          disabled={!activeDefinitions.some((definition) => !selectedIds.has(definition.id))}
          onClick={() => {
            const definition = activeDefinitions.find((item) => !selectedIds.has(item.id))
            if (definition) onChange([...value, snapshotRotatingAchievement(definition)])
          }}
        >
          + {addLabel}
        </button>
      ) : (
        <span className="count-pill">5 de 5</span>
      )}
      <p className="field-help">
        La selección queda guardada como snapshot del evento. Cambiar el catálogo no modifica esta configuración.
      </p>
      {activeDefinitions.length === 0 && value.length === 0 && (
        <p className="field-help">Crea o reactiva logros rotativos en Configuración global para preparar un nuevo evento.</p>
      )}
    </div>
  )
}
