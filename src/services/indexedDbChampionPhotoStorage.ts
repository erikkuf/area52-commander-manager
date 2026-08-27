import type { ChampionPhotoReference } from '../domain/tournament'
import { createId } from '../utils/id'
import {
  validateChampionPhotoFile,
  type ChampionPhotoFile,
  type ChampionPhotoStorage,
} from './championPhotoStorage'

const DATABASE_NAME = 'area52-commander-manager-media'
const DATABASE_VERSION = 1
const STORE_NAME = 'champion-photos'

interface StoredChampionPhoto {
  storageKey: string
  blob: Blob
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo acceder a IndexedDB.'))
  })
}

export class IndexedDbChampionPhotoStorage implements ChampionPhotoStorage {
  private databasePromise?: Promise<IDBDatabase>

  constructor(private readonly indexedDb: IDBFactory = window.indexedDB) {}

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.indexedDb.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'storageKey' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'))
    })
    return this.databasePromise
  }

  async save(
    snapshotId: string,
    file: ChampionPhotoFile,
  ): Promise<ChampionPhotoReference> {
    validateChampionPhotoFile(file)
    const database = await this.openDatabase()
    const storageKey = `champion-photo:${snapshotId}`
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    await requestResult(transaction.objectStore(STORE_NAME).put({ storageKey, blob: file }))
    return {
      id: createId('champion-photo'),
      fileName: file.name,
      mimeType: file.type,
      storageKey,
    }
  }

  async remove(reference: ChampionPhotoReference): Promise<void> {
    const database = await this.openDatabase()
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    await requestResult(transaction.objectStore(STORE_NAME).delete(reference.storageKey))
  }

  async getPreview(reference: ChampionPhotoReference): Promise<string | null> {
    const database = await this.openDatabase()
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const stored = await requestResult(
      transaction.objectStore(STORE_NAME).get(reference.storageKey),
    ) as StoredChampionPhoto | undefined
    return stored?.blob ? URL.createObjectURL(stored.blob) : null
  }
}

export function createBrowserChampionPhotoStorage(): ChampionPhotoStorage {
  return new IndexedDbChampionPhotoStorage(window.indexedDB)
}
