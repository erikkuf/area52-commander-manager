import { DomainError } from './errors'
import type { ChampionPhotoCrop, ChampionPhotoReference } from './tournament'

export const DEFAULT_CHAMPION_PHOTO_CROP: ChampionPhotoCrop = { x: 0.5, y: 0.5, zoom: 1 }
export const MAX_CHAMPION_PHOTO_ZOOM = 4
export type ChampionPhotoView = 'card' | 'detail'
export const CHAMPION_PHOTO_ASPECT_RATIOS = { card: 3 / 4, detail: 4 / 3 } as const

export function isValidChampionPhotoCrop(value: unknown): value is ChampionPhotoCrop {
  if (!value || typeof value !== 'object') return false
  const crop = value as ChampionPhotoCrop
  return Number.isFinite(crop.x) && crop.x >= 0 && crop.x <= 1 &&
    Number.isFinite(crop.y) && crop.y >= 0 && crop.y <= 1 &&
    Number.isFinite(crop.zoom) && crop.zoom >= 1 && crop.zoom <= MAX_CHAMPION_PHOTO_ZOOM
}

/** Ausente o inválido: cover centrado, compatible con referencias antiguas. */
export function getChampionPhotoCrop(crop?: ChampionPhotoCrop): ChampionPhotoCrop {
  return { ...(isValidChampionPhotoCrop(crop) ? crop : DEFAULT_CHAMPION_PHOTO_CROP) }
}

export function withChampionPhotoCrops(
  reference: ChampionPhotoReference,
  cardCrop: ChampionPhotoCrop,
  detailCrop: ChampionPhotoCrop,
): ChampionPhotoReference {
  if (!isValidChampionPhotoCrop(cardCrop) || !isValidChampionPhotoCrop(detailCrop)) {
    throw new DomainError('El encuadre debe tener posiciones entre 0 y 1 y zoom entre 1 y 4.')
  }
  return { ...reference, cardCrop: { ...cardCrop }, detailCrop: { ...detailCrop } }
}

export function normalizeChampionPhotoReference(reference: ChampionPhotoReference): ChampionPhotoReference {
  return {
    ...reference,
    cardCrop: isValidChampionPhotoCrop(reference.cardCrop) ? { ...reference.cardCrop } : undefined,
    detailCrop: isValidChampionPhotoCrop(reference.detailCrop) ? { ...reference.detailCrop } : undefined,
  }
}

export function calculatePhotoCropLayout(
  image: { width: number; height: number },
  frame: { width: number; height: number },
  input?: ChampionPhotoCrop,
) {
  if (![image.width, image.height, frame.width, frame.height].every((value) => Number.isFinite(value) && value > 0)) {
    throw new DomainError('Las dimensiones de la foto y su marco deben ser positivas.')
  }
  const crop = getChampionPhotoCrop(input)
  const scale = Math.max(frame.width / image.width, frame.height / image.height) * crop.zoom
  const width = image.width * scale
  const height = image.height * scale
  const overflowX = Math.max(0, width - frame.width)
  const overflowY = Math.max(0, height - frame.height)
  return { width, height, left: overflowX ? -overflowX * crop.x : 0, top: overflowY ? -overflowY * crop.y : 0, overflowX, overflowY }
}

export function movePhotoCrop(
  crop: ChampionPhotoCrop,
  delta: { x: number; y: number },
  overflow: { overflowX: number; overflowY: number },
): ChampionPhotoCrop {
  const current = getChampionPhotoCrop(crop)
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  return {
    ...current,
    x: overflow.overflowX > 0 ? clamp(current.x - delta.x / overflow.overflowX) : current.x,
    y: overflow.overflowY > 0 ? clamp(current.y - delta.y / overflow.overflowY) : current.y,
  }
}
