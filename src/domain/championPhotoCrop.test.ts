import { describe, expect, it } from 'vitest'
import {
  calculatePhotoCropLayout, DEFAULT_CHAMPION_PHOTO_CROP, getChampionPhotoCrop,
  isValidChampionPhotoCrop, movePhotoCrop, withChampionPhotoCrops,
} from './championPhotoCrop'
import { updateChampionSnapshotMetadata } from './hallOfFame'
import type { ChampionPhotoReference, LeagueChampionSnapshot, LeaguePrizeLedger } from './tournament'
import { deserializeLeaguePrizeLedger, serializeLeaguePrizeLedger } from '../services/localStorageLeaguePrizeRepository'
import { MemoryChampionPhotoStorage } from '../services/championPhotoStorage'

const reference: ChampionPhotoReference = { id: 'photo', fileName: 'original.webp', mimeType: 'image/webp', storageKey: 'photo:champion' }
const snapshot: LeagueChampionSnapshot = {
  id: 'champion', leaguePeriodId: 'league', leagueName: 'Liga de prueba', playerKey: 'player-a',
  playerName: 'Jugador A', finalPosition: 1, leaguePoints: 24, achievementPoints: 20,
  specialLeaguePoints: 4, tableWins: 3, eliminations: 7, tournamentsPlayed: 2,
  championPhoto: reference, commanderName: 'Comandante', deckName: 'Mazo', deckUrl: 'https://example.com',
  createdAt: '2026-09-29T12:00:00Z',
}
const ledger = (): LeaguePrizeLedger => ({
  leaguePeriods: [], contributions: [], creditMovements: [], specialPointMovements: [], championSnapshots: [snapshot],
})
describe('encuadres independientes del Hall of Fame', () => {
  it('foto antigua sin crop conserva cover centrado', () => {
    expect(getChampionPhotoCrop(reference.cardCrop)).toEqual(DEFAULT_CHAMPION_PHOTO_CROP)
    expect(calculatePhotoCropLayout({ width: 800, height: 400 }, { width: 300, height: 400 })).toMatchObject({
      width: 800, height: 400, left: -250, top: 0,
    })
  })
  it('guarda tarjeta y detalle independientes sin mutar referencia original', () => {
    const photo = withChampionPhotoCrops(reference, { x: 0, y: 1, zoom: 2 }, { x: 1, y: 0, zoom: 1.5 })
    expect(photo.cardCrop).not.toEqual(photo.detailCrop)
    expect(photo.storageKey).toBe(reference.storageKey)
    expect(reference.cardCrop).toBeUndefined()
  })
  it('editar crop solo cambia presentación; conserva identidad, metadata y estadísticas', () => {
    const original = ledger()
    const photo = withChampionPhotoCrops(reference, { x: 0.2, y: 0.8, zoom: 2 }, { x: 0.6, y: 0.1, zoom: 3 })
    const updated = updateChampionSnapshotMetadata(original, snapshot.id, { ...snapshot, championPhoto: photo })
    expect({ ...updated.championSnapshots[0], championPhoto: reference, updatedAt: undefined }).toEqual({ ...snapshot, updatedAt: undefined })
    expect(updated.creditMovements).toBe(original.creditMovements)
    const draft = withChampionPhotoCrops(photo, { x: 1, y: 1, zoom: 4 }, photo.detailCrop!)
    expect(draft.cardCrop).not.toEqual(photo.cardCrop)
    expect(updated.championSnapshots[0].championPhoto).toEqual(photo) // cancelar/descartar draft no muta persistido
  })
  it('impide áreas vacías al arrastrar y hacer zoom en ambos ratios', () => {
    for (const frame of [{ width: 300, height: 400 }, { width: 400, height: 300 }]) {
      for (const image of [{ width: 800, height: 400 }, { width: 400, height: 800 }]) {
        for (const zoom of [1, 2, 4]) {
          const crop = { x: 0.5, y: 0.5, zoom }
          const layout = calculatePhotoCropLayout(image, frame, crop)
          for (const delta of [{ x: 10000, y: 10000 }, { x: -10000, y: -10000 }]) {
            const moved = calculatePhotoCropLayout(image, frame, movePhotoCrop(crop, delta, layout))
            expect(moved.left).toBeLessThanOrEqual(0)
            expect(moved.top).toBeLessThanOrEqual(0)
            expect(moved.left + moved.width).toBeGreaterThanOrEqual(frame.width)
            expect(moved.top + moved.height).toBeGreaterThanOrEqual(frame.height)
          }
        }
      }
    }
  })
  it('rechaza metadata inválida en dominio y usa fallback seguro al visualizar', () => {
    const invalid = { x: -1, y: 2, zoom: 0 }
    expect(isValidChampionPhotoCrop(invalid)).toBe(false)
    expect(getChampionPhotoCrop(invalid)).toEqual(DEFAULT_CHAMPION_PHOTO_CROP)
    expect(() => withChampionPhotoCrops(reference, invalid, DEFAULT_CHAMPION_PHOTO_CROP)).toThrow(/encuadre/)
    expect(() => updateChampionSnapshotMetadata(ledger(), snapshot.id, { championPhoto: { ...reference, cardCrop: invalid } })).toThrow(/encuadre/)
  })
  it('migra ledger 8 conservando foto original, estadísticas y crop ausente; es idempotente', () => {
    const restored = deserializeLeaguePrizeLedger(JSON.stringify({ version: 8, ledger: ledger() }))!
    expect(restored.championSnapshots[0]).toMatchObject(snapshot)
    expect(restored.championSnapshots[0].championPhoto?.cardCrop).toBeUndefined()
    expect(restored.championSnapshots[0].championPhoto?.detailCrop).toBeUndefined()
    expect(deserializeLeaguePrizeLedger(serializeLeaguePrizeLedger(restored))).toEqual(restored)
  })
  it('persiste ambos encuadres tras reload sin base64 ni modificación del original binario', async () => {
    const storage = new MemoryChampionPhotoStorage()
    const file = Object.assign(new Blob(['imagen original'], { type: 'image/webp' }), { name: 'original.webp' })
    const originalReference = await storage.save(snapshot.id, file)
    const photo = withChampionPhotoCrops(originalReference, { x: 0.1, y: 0.9, zoom: 2 }, { x: 0.8, y: 0.2, zoom: 1.5 })
    const updated = updateChampionSnapshotMetadata(ledger(), snapshot.id, { ...snapshot, championPhoto: photo })
    const serialized = serializeLeaguePrizeLedger(updated)
    const restored = deserializeLeaguePrizeLedger(serialized)!
    expect(restored.championSnapshots[0].championPhoto).toEqual(photo)
    expect(serialized).not.toContain('base64')
    expect(storage.has(originalReference)).toBe(true)
    expect(storage.fileName(originalReference)).toBe(file.name)
    expect(storage.size).toBe(1)
    expect(await storage.getPreview(restored.championSnapshots[0].championPhoto!)).not.toBeNull()
  })
  it('encuadre inválido importado no inutiliza la liga ni su foto', () => {
    const original = ledger()
    original.championSnapshots = [{ ...snapshot, championPhoto: { ...reference, cardCrop: { x: 99, y: 0.5, zoom: 1 }, detailCrop: { x: 0.2, y: 0.3, zoom: 2 } } }]
    const restored = deserializeLeaguePrizeLedger(serializeLeaguePrizeLedger(original))!
    expect(restored.championSnapshots[0].championPhoto?.cardCrop).toBeUndefined()
    expect(restored.championSnapshots[0].championPhoto?.detailCrop).toEqual({ x: 0.2, y: 0.3, zoom: 2 })
    expect(restored.championSnapshots[0].championPhoto?.storageKey).toBe(reference.storageKey)
  })
})
