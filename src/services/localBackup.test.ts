import { describe, expect, it } from 'vitest'
import { createDefaultLeaguePrizeLedger } from '../domain/prizes'
import { createTournament } from '../domain/tournamentOperations'
import { createEmptyWorkspace, upsertWorkspaceTournament } from '../domain/workspace'
import { createLocalBackup, parseLocalBackup } from './localBackup'

describe('respaldo local', () => {
  it('exporta y restaura workspace, ledger y torneo abierto', () => {
    const tournament = createTournament({
      name: 'Evento respaldado',
      date: '2026-08-19',
      totalRounds: 1,
      rotating1: 'R1',
      rotating2: 'R2',
      rotating3: 'R3',
      type: 'independent',
      prizeMode: 'none',
      prizePool: 0,
      percentagesByPosition: [50, 30, 20],
    })
    const workspace = upsertWorkspaceTournament(createEmptyWorkspace(), tournament)
    workspace.navigation.openedTournamentId = tournament.id
    const ledger = createDefaultLeaguePrizeLedger()

    const restored = parseLocalBackup(
      createLocalBackup(workspace, ledger, 'http://localhost:5173', '2026-08-19T12:00:00.000Z'),
    )

    expect(restored.workspace.tournaments[0].id).toBe(tournament.id)
    expect(restored.currentTournament?.id).toBe(tournament.id)
    expect(restored.ledger).toEqual(ledger)
  })

  it('rechaza respaldos incompletos', () => {
    expect(() => parseLocalBackup(JSON.stringify({ app: 'Area 52', data: {} }))).toThrow(
      /incompleto|compatible/,
    )
  })
})
