import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  calculatePhotoCropLayout,
  CHAMPION_PHOTO_ASPECT_RATIOS,
  movePhotoCrop,
  type ChampionPhotoView,
} from '../domain/championPhotoCrop'
import type { ChampionPhotoCrop } from '../domain/tournament'

export function CroppedChampionPhoto({ src, alt, crop, view, onCropChange }: {
  src: string | null
  alt: string
  crop?: ChampionPhotoCrop
  view: ChampionPhotoView
  onCropChange?: (crop: ChampionPhotoCrop) => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  const [image, setImage] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = frameRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setFrame({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const layout = image.width > 0 && frame.width > 0 && frame.height > 0
    ? calculatePhotoCropLayout(image, frame, crop)
    : null
  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return (
    <div
      ref={frameRef}
      className={`champion-photo-frame${onCropChange ? ' champion-photo-frame--editable' : ''}${!src ? ' champion-photo--placeholder' : ''}`}
      style={{ aspectRatio: CHAMPION_PHOTO_ASPECT_RATIOS[view] }}
      aria-label={onCropChange ? `Arrastrar para ajustar ${view === 'card' ? 'tarjeta' : 'detalle'}` : undefined}
      onPointerDown={(event) => {
        if (!onCropChange || !layout || !event.isPrimary || event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      }}
      onPointerMove={(event) => {
        const previous = drag.current
        if (!previous || previous.pointerId !== event.pointerId || !onCropChange || !layout || !crop) return
        onCropChange(movePhotoCrop(crop, { x: event.clientX - previous.x, y: event.clientY - previous.y }, layout))
        drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      }}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onLostPointerCapture={() => { drag.current = null }}
    >
      {src ? <img
        key={src}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(event) => setImage({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        style={layout ? { width: layout.width, height: layout.height, left: layout.left, top: layout.top } : { width: '100%', height: '100%', objectFit: 'cover' }}
      /> : <><span>1</span><small>CAMPEÓN</small></>}
    </div>
  )
}
