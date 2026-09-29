import { useState } from 'react'
import { CroppedChampionPhoto } from '../../components/CroppedChampionPhoto'
import { getChampionPhotoCrop, MAX_CHAMPION_PHOTO_ZOOM } from '../../domain/championPhotoCrop'
import type { ChampionPhotoCrop } from '../../domain/tournament'

export function ChampionPhotoCropEditor({ src, cardCrop, detailCrop, onSave, onCancel }: {
  src: string
  cardCrop?: ChampionPhotoCrop
  detailCrop?: ChampionPhotoCrop
  onSave: (card: ChampionPhotoCrop, detail: ChampionPhotoCrop) => void
  onCancel: () => void
}) {
  const [card, setCard] = useState(() => getChampionPhotoCrop(cardCrop))
  const [detail, setDetail] = useState(() => getChampionPhotoCrop(detailCrop))
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="crop-photo-title">
      <button className="modal-backdrop" type="button" aria-label="Cancelar encuadre" onClick={onCancel} />
      <section className="admin-modal photo-crop-modal">
        <div className="modal-header"><h2 id="crop-photo-title">Ajustar foto</h2><button className="drawer-close" type="button" aria-label="Cancelar encuadre" onClick={onCancel}>×</button></div>
        <p className="modal-copy">Arrastra cada imagen y ajusta su zoom. Tarjeta y detalle tienen encuadres independientes; el archivo original se conserva.</p>
        <div className="photo-crop-grid">
          {(['card', 'detail'] as const).map((view) => {
            const value = view === 'card' ? card : detail
            const setValue = view === 'card' ? setCard : setDetail
            const label = view === 'card' ? 'Tarjeta Hall of Fame' : 'Vista detalle'
            const zoom = (amount: number) => setValue((current) => ({ ...current, zoom: Math.max(1, Math.min(MAX_CHAMPION_PHOTO_ZOOM, current.zoom + amount)) }))
            return <section className="photo-crop-panel" key={view}>
              <h3>{label}</h3>
              <CroppedChampionPhoto src={src} alt={`Preview · ${label}`} view={view} crop={value} onCropChange={setValue} />
              <label className="field"><span>Zoom · {value.zoom.toFixed(2)}×</span><input aria-label={`Zoom ${label}`} type="range" min="1" max={MAX_CHAMPION_PHOTO_ZOOM} step="0.01" value={value.zoom} onChange={(event) => setValue({ ...value, zoom: Number(event.target.value) })} /></label>
              <div className="photo-crop-controls"><button className="secondary-button" type="button" aria-label={`Alejar ${label}`} disabled={value.zoom <= 1} onClick={() => zoom(-0.1)}>−</button><button className="secondary-button" type="button" aria-label={`Acercar ${label}`} disabled={value.zoom >= MAX_CHAMPION_PHOTO_ZOOM} onClick={() => zoom(0.1)}>+</button><button className="text-button" type="button" onClick={() => setValue(getChampionPhotoCrop())}>Restablecer</button></div>
              <div className="photo-crop-position">
                <label className="field"><span>Horizontal</span><input aria-label={`Posición horizontal ${label}`} type="range" min="0" max="1" step="0.01" value={value.x} onChange={(event) => setValue({ ...value, x: Number(event.target.value) })} /></label>
                <label className="field"><span>Vertical</span><input aria-label={`Posición vertical ${label}`} type="range" min="0" max="1" step="0.01" value={value.y} onChange={(event) => setValue({ ...value, y: Number(event.target.value) })} /></label>
              </div>
            </section>
          })}
        </div>
        <p className="field-help">El encuadre se aplicará al guardar el registro. Cancelar conserva la foto y el encuadre anteriores.</p>
        <div className="modal-actions"><button className="secondary-button" type="button" onClick={onCancel}>Cancelar</button><button className="primary-button" type="button" onClick={() => onSave(card, detail)}>Guardar encuadres</button></div>
      </section>
    </div>
  )
}
