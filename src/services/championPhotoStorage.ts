import type { ChampionPhotoReference } from '../domain/tournament'
import { DomainError } from '../domain/errors'
import { createId } from '../utils/id'

export const CHAMPION_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export const MAX_CHAMPION_PHOTO_BYTES = 5 * 1024 * 1024

export interface ChampionPhotoFile extends Blob {
  name: string
}

export interface ChampionPhotoStorage {
  save(snapshotId: string, file: ChampionPhotoFile): Promise<ChampionPhotoReference>
  remove(reference: ChampionPhotoReference): Promise<void>
  getPreview(reference: ChampionPhotoReference): Promise<string | null>
}

export function validateChampionPhotoFile(file: ChampionPhotoFile): void {
  if (!CHAMPION_PHOTO_MIME_TYPES.includes(file.type as typeof CHAMPION_PHOTO_MIME_TYPES[number])) {
    throw new DomainError('La foto debe estar en formato JPEG, PNG o WebP.')
  }
  if (file.size <= 0) throw new DomainError('La foto seleccionada está vacía.')
  if (file.size > MAX_CHAMPION_PHOTO_BYTES) {
    throw new DomainError('La foto supera el límite de 5 MB.')
  }
}

export class MemoryChampionPhotoStorage implements ChampionPhotoStorage {
  private readonly files = new Map<string, ChampionPhotoFile>()

  async save(
    snapshotId: string,
    file: ChampionPhotoFile,
  ): Promise<ChampionPhotoReference> {
    validateChampionPhotoFile(file)
    const storageKey = `champion-photo:${snapshotId}`
    this.files.set(storageKey, file)
    return {
      id: createId('champion-photo'),
      fileName: file.name,
      mimeType: file.type,
      storageKey,
    }
  }

  async remove(reference: ChampionPhotoReference): Promise<void> {
    this.files.delete(reference.storageKey)
  }

  async getPreview(reference: ChampionPhotoReference): Promise<string | null> {
    return this.files.has(reference.storageKey)
      ? `memory://${encodeURIComponent(reference.storageKey)}`
      : null
  }

  has(reference: ChampionPhotoReference): boolean {
    return this.files.has(reference.storageKey)
  }

  get size(): number {
    return this.files.size
  }

  fileName(reference: ChampionPhotoReference): string | undefined {
    return this.files.get(reference.storageKey)?.name
  }
}
