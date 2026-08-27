import { describe, expect, it } from 'vitest'
import {
  MAX_CHAMPION_PHOTO_BYTES,
  MemoryChampionPhotoStorage,
  validateChampionPhotoFile,
  type ChampionPhotoFile,
} from './championPhotoStorage'

function photo(name: string, mimeType: string, size = 16): ChampionPhotoFile {
  return Object.assign(
    new Blob([new Uint8Array(size)], { type: mimeType }),
    { name },
  )
}

describe('ChampionPhotoStorage', () => {
  it.each([
    ['campeon.jpg', 'image/jpeg'],
    ['campeon.png', 'image/png'],
    ['campeon.webp', 'image/webp'],
  ])('acepta %s', (name, mimeType) => {
    expect(() => validateChampionPhotoFile(photo(name, mimeType))).not.toThrow()
  })

  it('rechaza tipos no permitidos', () => {
    expect(() => validateChampionPhotoFile(photo('campeon.gif', 'image/gif'))).toThrow(
      /JPEG, PNG o WebP/i,
    )
  })

  it('rechaza archivos sobre 5 MB', () => {
    expect(() => validateChampionPhotoFile(
      photo('grande.jpg', 'image/jpeg', MAX_CHAMPION_PHOTO_BYTES + 1),
    )).toThrow(/5 MB/i)
  })

  it('guarda una referencia sin convertir la imagen a base64', async () => {
    const storage = new MemoryChampionPhotoStorage()
    const reference = await storage.save('snapshot-1', photo('campeon.webp', 'image/webp'))
    expect(reference).toMatchObject({
      fileName: 'campeon.webp',
      mimeType: 'image/webp',
      storageKey: 'champion-photo:snapshot-1',
    })
    expect(JSON.stringify(reference)).not.toContain('base64')
    expect(await storage.getPreview(reference)).toContain('memory://')
  })

  it('reemplaza la foto del mismo snapshot sin duplicar archivos', async () => {
    const storage = new MemoryChampionPhotoStorage()
    const first = await storage.save('snapshot-1', photo('primera.jpg', 'image/jpeg'))
    const replacement = await storage.save('snapshot-1', photo('segunda.png', 'image/png'))
    expect(replacement.storageKey).toBe(first.storageKey)
    expect(storage.size).toBe(1)
    expect(storage.fileName(replacement)).toBe('segunda.png')
  })

  it('elimina la foto sin borrar el snapshot deportivo', async () => {
    const storage = new MemoryChampionPhotoStorage()
    const reference = await storage.save('snapshot-1', photo('campeon.jpg', 'image/jpeg'))
    await storage.remove(reference)
    expect(storage.has(reference)).toBe(false)
    expect(await storage.getPreview(reference)).toBeNull()
  })
})
