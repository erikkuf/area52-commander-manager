import { describe, expect, it } from 'vitest'
import { importParticipants, renameParticipant } from './participants'
import { createTournament } from './tournamentOperations'
import type { IdFactory } from './tournament'

function ids(): IdFactory {
  let value = 0
  return (prefix) => `${prefix}-${++value}`
}

function emptyTournament() {
  return createTournament(
    {
      name: 'Fecha',
      date: '2026-08-13',
      totalRounds: 3,
      rotating1: 'Uno',
      rotating2: 'Dos',
      rotating3: 'Tres',
      prizePool: 0,
      percentagesByPosition: [50, 30, 20],
    },
    ids(),
  )
}

describe('participantes', () => {
  it('detecta líneas vacías, duplicados internos y jugadores ya registrados', () => {
    const idFactory = ids()
    const firstImport = importParticipants(emptyTournament(), 'Pablo Ortega\nCamila Soto', idFactory)
    const secondImport = importParticipants(
      firstImport.tournament,
      'Pablo Ortega\n\nNicolás Reyes\nNicolas Reyes\n',
      idFactory,
    )

    expect(secondImport.report.added).toBe(1)
    expect(secondImport.report.blankLineNumbers).toEqual([2, 5])
    expect(secondImport.report.existingNames).toEqual(['Pablo Ortega'])
    expect(secondImport.report.duplicateNames).toEqual(['Nicolas Reyes'])
    expect(secondImport.tournament.participants).toHaveLength(3)
  })

  it('mantiene el ID interno al editar un nombre y evita nombres duplicados', () => {
    const imported = importParticipants(emptyTournament(), 'Pablo Ortega\nCamila Soto', ids())
    const participantId = imported.tournament.participants[0].id
    const renamed = renameParticipant(imported.tournament, participantId, 'Pablo O.')

    expect(renamed.participants[0]).toMatchObject({ id: participantId, name: 'Pablo O.' })
    expect(() => renameParticipant(renamed, participantId, 'Camila Soto')).toThrow(/Ya existe/)
  })
})
