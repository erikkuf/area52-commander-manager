import type { IdFactory } from '../domain/tournament'

export const createId: IdFactory = (prefix) => {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${value}`
}
