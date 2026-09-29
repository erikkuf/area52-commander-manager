import { useEffect, useState } from 'react'
import type { ChampionPhotoReference } from '../../domain/tournament'
import type { ChampionPhotoFile, ChampionPhotoStorage } from '../../services/championPhotoStorage'

export function useChampionPhotoPreview(reference: ChampionPhotoReference | undefined, storage: ChampionPhotoStorage) {
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    setPreview(null)
    if (reference) storage.getPreview(reference).then((url) => {
      if (!active) {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
        return
      }
      objectUrl = url
      setPreview(url)
    }).catch(() => { if (active) setPreview(null) })
    return () => {
      active = false
      if (objectUrl?.startsWith('blob:')) URL.revokeObjectURL(objectUrl)
    }
    // Crop changes do not reload the original binary. A replacement receives a new reference ID.
  }, [storage, reference?.id, reference?.storageKey])
  return preview
}

export function usePhotoFilePreview(file: ChampionPhotoFile | null | undefined) {
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  return preview
}
