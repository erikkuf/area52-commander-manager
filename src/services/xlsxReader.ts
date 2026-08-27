import { unzipSync } from 'fflate'

export type SpreadsheetCell = string | number | boolean | null

export interface SpreadsheetSheet {
  name: string
  rows: SpreadsheetCell[][]
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, token: string) => {
    if (token.toLowerCase() === 'amp') return '&'
    if (token.toLowerCase() === 'lt') return '<'
    if (token.toLowerCase() === 'gt') return '>'
    if (token.toLowerCase() === 'quot') return '"'
    if (token.toLowerCase() === 'apos') return "'"
    const radix = token.toLowerCase().startsWith('#x') ? 16 : 10
    const numeric = Number.parseInt(token.replace(/^#x?/i, ''), radix)
    return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity
  })
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? 'A'
  return [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXml([...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((text) => text[1])
      .join('')),
  )
}

function parseWorksheet(xml: string, sharedStrings: string[]): SpreadsheetCell[][] {
  const rows: SpreadsheetCell[][] = []
  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const row: SpreadsheetCell[] = []
    const populatedCells = rowMatch[1].replace(/<c\b[^>]*\/>/g, '')
    for (const cellMatch of populatedCells.matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1]
      const body = cellMatch[2]
      const reference = /\br="([^"]+)"/.exec(attributes)?.[1] ?? 'A1'
      const type = /\bt="([^"]+)"/.exec(attributes)?.[1]
      const rawValue = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1]
      const inlineValue = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(body)?.[1]
      let value: SpreadsheetCell = null
      if (type === 's' && rawValue !== undefined) value = sharedStrings[Number(rawValue)] ?? ''
      else if (type === 'inlineStr' || type === 'str') value = decodeXml(inlineValue ?? rawValue ?? '')
      else if (type === 'b') value = rawValue === '1'
      else if (rawValue !== undefined && rawValue !== '') {
        const numeric = Number(rawValue)
        value = Number.isFinite(numeric) ? numeric : decodeXml(rawValue)
      }
      row[columnIndex(reference)] = value
    }
    while (row.length > 0 && (row.at(-1) === null || row.at(-1) === undefined)) row.pop()
    rows.push(row.map((cell) => cell ?? null))
  }
  return rows
}

export function parseXlsx(arrayBuffer: ArrayBuffer): SpreadsheetSheet[] {
  const files = unzipSync(new Uint8Array(arrayBuffer))
  const text = (path: string) => {
    const content = files[path]
    return content ? new TextDecoder().decode(content) : ''
  }
  const workbookXml = text('xl/workbook.xml')
  const relationshipsXml = text('xl/_rels/workbook.xml.rels')
  const relationshipTargets = new Map(
    [...relationshipsXml.matchAll(/<Relationship\s([^>]+)\/?>(?:<\/Relationship>)?/g)].map((match) => {
      const id = /\bId="([^"]+)"/.exec(match[1])?.[1] ?? ''
      const target = /\bTarget="([^"]+)"/.exec(match[1])?.[1] ?? ''
      return [id, target]
    }),
  )
  const sharedStrings = parseSharedStrings(text('xl/sharedStrings.xml'))
  return [...workbookXml.matchAll(/<sheet\s([^>]+)\/?>(?:<\/sheet>)?/g)].map((match) => {
    const name = decodeXml(/\bname="([^"]+)"/.exec(match[1])?.[1] ?? 'Hoja')
    const relationshipId = /\br:id="([^"]+)"/.exec(match[1])?.[1] ?? ''
    const target = relationshipTargets.get(relationshipId) ?? ''
    const normalizedTarget = target.startsWith('/')
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, '')}`
    return { name, rows: parseWorksheet(text(normalizedTarget), sharedStrings) }
  })
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"' && quoted && line[index + 1] === '"') { current += '"'; index += 1 }
    else if (character === '"') quoted = !quoted
    else if ((character === ',' || character === ';') && !quoted) { values.push(current); current = '' }
    else current += character
  }
  values.push(current)
  return values
}

export async function readSpreadsheetFile(file: File): Promise<SpreadsheetSheet[]> {
  if (file.name.toLocaleLowerCase().endsWith('.csv')) {
    return [{ name: 'CSV', rows: (await file.text()).split(/\r?\n/).map(parseCsvLine) }]
  }
  return parseXlsx(await file.arrayBuffer())
}
