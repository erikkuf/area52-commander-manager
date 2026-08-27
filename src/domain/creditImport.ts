import { DomainError } from './errors'
import { canonicalizePlayerName } from './participants'
import type { PlayerIdentity } from './playerRegistry'
import type { CreditMovement } from './tournament'
import type { SpreadsheetSheet } from '../services/xlsxReader'
import { calculateAvailableCredit } from './credits'

export type CreditImportStatus = 'ready' | 'unmatched' | 'duplicate' | 'invalid' | 'insufficient'

export interface CreditUsageImportRow {
  sourceReference: string
  sheetName: string
  rowNumber: number
  playerName: string
  playerKey?: string
  amount: number
  status: CreditImportStatus
  message: string
}

export interface CreditUsageImportPreview {
  fileName: string
  rows: CreditUsageImportRow[]
}

function normalizeHeader(value: unknown): string {
  return canonicalizePlayerName(String(value ?? '')).replace(/\s+/g, '')
}

function resolveIdentity(registry: PlayerIdentity[], playerName: string): PlayerIdentity | undefined {
  const canonical = canonicalizePlayerName(playerName)
  const matches = registry.filter((identity) =>
    canonicalizePlayerName(identity.canonicalName) === canonical ||
    identity.aliases.some((alias) => canonicalizePlayerName(alias) === canonical),
  )
  return matches.length === 1 ? matches[0] : undefined
}

export function buildCreditUsageImportPreview(
  sheets: SpreadsheetSheet[],
  fileName: string,
  leaguePeriodId: string,
  registry: PlayerIdentity[],
  movements: CreditMovement[],
): CreditUsageImportPreview {
  const importedReferences = new Set(movements.map((movement) => movement.sourceReference).filter(Boolean))
  const existingUsage = new Map<string, number>()
  movements
    .filter((movement) => movement.leaguePeriodId === leaguePeriodId && movement.type === 'usage' && movement.status === 'active')
    .forEach((movement) => existingUsage.set(
      movement.playerKey,
      (existingUsage.get(movement.playerKey) ?? 0) + movement.amount,
    ))
  const rows: CreditUsageImportRow[] = []
  const candidates = sheets.flatMap((sheet) => {
    const headerIndex = sheet.rows.findIndex((row) => {
      const headers = row.map(normalizeHeader)
      return headers.includes('jugador') && headers.some((header) => header === 'creditousado' || header === 'usado')
    })
    if (headerIndex < 0) return []
    const headers = sheet.rows[headerIndex].map(normalizeHeader)
    const playerColumn = headers.indexOf('jugador')
    const amountColumn = headers.findIndex((header) => header === 'creditousado' || header === 'usado')
    return [{
      sheet,
      headerIndex,
      playerColumn,
      amountColumn,
      isConsolidated: headers[amountColumn] === 'creditousado',
    }]
  })
  const selectedCandidates = candidates.some((candidate) => candidate.isConsolidated)
    ? candidates.filter((candidate) => candidate.isConsolidated)
    : candidates
  selectedCandidates.forEach(({ sheet, headerIndex, playerColumn, amountColumn }) => {
    sheet.rows.slice(headerIndex + 1).forEach((row, offset) => {
      const playerName = String(row[playerColumn] ?? '').trim()
      const sourceAmount = Number(row[amountColumn] ?? 0)
      if (!playerName && !sourceAmount) return
      const identity = resolveIdentity(registry, playerName)
      const alreadyRegistered = identity ? existingUsage.get(identity.playerKey) ?? 0 : 0
      const amount = Math.max(0, sourceAmount - alreadyRegistered)
      const sourceReference = `excel:${leaguePeriodId}:${fileName}:${sheet.name}:${headerIndex + offset + 2}:${canonicalizePlayerName(playerName)}:${sourceAmount}`
      const status: CreditImportStatus = !playerName || !Number.isFinite(sourceAmount) || sourceAmount < 0
        ? 'invalid'
        : importedReferences.has(sourceReference) || (identity && sourceAmount === alreadyRegistered && sourceAmount > 0)
            ? 'duplicate'
            : !identity
              ? 'unmatched'
              : sourceAmount < alreadyRegistered
                ? 'invalid'
                : amount === 0
                  ? 'invalid'
                  : amount > calculateAvailableCredit(movements, identity.playerKey)
                    ? 'insufficient'
                    : 'ready'
      rows.push({
        sourceReference,
        sheetName: sheet.name,
        rowNumber: headerIndex + offset + 2,
        playerName,
        playerKey: identity?.playerKey,
        amount,
        status,
        message: status === 'ready'
          ? alreadyRegistered > 0 ? `Importar diferencia; ya hay ${alreadyRegistered}` : 'Listo para importar'
          : status === 'duplicate' ? 'Ya registrado'
            : status === 'unmatched' ? 'Jugador no reconocido'
              : status === 'insufficient' ? 'Supera el crédito disponible'
                : sourceAmount === 0 ? 'Sin uso de crédito' : 'Fila inválida o menor que lo registrado',
      })
    })
  })
  if (rows.length === 0) {
    throw new DomainError('No se encontró una tabla con las columnas “Jugador” y “Crédito Usado” o “Usado”.')
  }
  return { fileName, rows }
}

function stableId(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `credit-import-${(hash >>> 0).toString(16)}`
}

export function importCreditUsageMovements(
  movements: CreditMovement[],
  preview: CreditUsageImportPreview,
  leaguePeriodId: string,
  now = new Date().toISOString(),
): CreditMovement[] {
  const existingReferences = new Set(movements.map((movement) => movement.sourceReference).filter(Boolean))
  const additions: CreditMovement[] = preview.rows
    .filter((row) => row.status === 'ready' && row.playerKey && !existingReferences.has(row.sourceReference))
    .map((row) => ({
      id: stableId(row.sourceReference),
      playerKey: row.playerKey!,
      leaguePeriodId,
      type: 'usage' as const,
      amount: row.amount,
      reason: `Uso importado · ${preview.fileName} · ${row.sheetName} fila ${row.rowNumber}`,
      createdAt: now,
      status: 'active' as const,
      sourceReference: row.sourceReference,
    }))
  return additions.length > 0 ? [...movements, ...additions] : movements
}
