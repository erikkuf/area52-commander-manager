import fs from 'node:fs'
import path from 'node:path'
import { recalculateTournamentAchievementPoints } from '../src/domain/achievements'
import { calculateAvailableCredit, registerCreditUsage } from '../src/domain/credits'
import {
  buildLeagueLeaderboard,
  buildTournamentFinancialDifferences,
  consolidateTournamentPrizes,
  synchronizeFinishedTournamentPrizes,
} from '../src/domain/league'
import { calculateTournamentStanding } from '../src/domain/leaderboard'
import { buildPlayerRegistry } from '../src/domain/playerRegistry'
import { calculateLeaguePoolSummary } from '../src/domain/prizes'
import type {
  CreditMovement,
  LeaguePrizeLedger,
  SpecialPointMovement,
  Tournament,
} from '../src/domain/tournament'
import { createLocalBackup, parseLocalBackup } from '../src/services/localBackup'

const LEAGUE_NAME = 'Liga Commander · Precon - Julio'
const CANONICAL_RUBEN_KEY = 'local-player:ruben munoz'
const RUBEN_ALIAS_KEY = 'local-player:ruben mu'
const RECONCILIATION_AT = new Date().toISOString()

interface BackupEnvelope {
  app: string
  exportedAt: string
  origin: string
  data: Record<string, string>
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function addSpecialPointCorrection(
  ledger: LeaguePrizeLedger,
  leaguePeriodId: string,
  playerKey: string,
  id: string,
  playerName: string,
): LeaguePrizeLedger {
  if (ledger.specialPointMovements.some((movement) => movement.id === id)) return ledger
  const correction: SpecialPointMovement = {
    id,
    leaguePeriodId,
    playerKey,
    amount: 1,
    reason: `Corrección auditoría Julio 2026 · ${playerName} debía recibir +2 y el movimiento original quedó en +1`,
    createdAt: RECONCILIATION_AT,
    status: 'active',
  }
  return {
    ...ledger,
    specialPointMovements: [...ledger.specialPointMovements, correction],
  }
}

function mergeRubenIdentity(
  tournaments: Tournament[],
  ledger: LeaguePrizeLedger,
): { tournaments: Tournament[]; ledger: LeaguePrizeLedger } {
  const canonicalize = (playerKey: string) =>
    playerKey === RUBEN_ALIAS_KEY ? CANONICAL_RUBEN_KEY : playerKey
  return {
    tournaments: tournaments.map((tournament) => ({
      ...tournament,
      participants: tournament.participants.map((participant) =>
        participant.playerKey === RUBEN_ALIAS_KEY
          ? { ...participant, playerKey: CANONICAL_RUBEN_KEY, name: 'Ruben Muñoz' }
          : participant,
      ),
    })),
    ledger: {
      ...ledger,
      specialPointMovements: ledger.specialPointMovements.map((movement) => ({
        ...movement,
        playerKey: canonicalize(movement.playerKey),
      })),
      creditMovements: ledger.creditMovements.map((movement) => ({
        ...movement,
        playerKey: canonicalize(movement.playerKey),
      })),
      leaguePeriods: ledger.leaguePeriods.map((period) => ({
        ...period,
        finalizedMonthlyAwards: period.finalizedMonthlyAwards?.map((award) => ({
          ...award,
          playerKey: canonicalize(award.playerKey),
        })),
        latestTheoreticalMonthlyAwards: period.latestTheoreticalMonthlyAwards?.map(
          (award) => ({ ...award, playerKey: canonicalize(award.playerKey) }),
        ),
        finalizedLeaderboardPlayerKeys: period.finalizedLeaderboardPlayerKeys?.map(
          canonicalize,
        ),
        administrativeLeaderboardPlayerKeys:
          period.administrativeLeaderboardPlayerKeys?.map(canonicalize),
      })),
    },
  }
}

function correctJavierVillacreses(tournament: Tournament): Tournament {
  if (tournament.name !== 'Fecha 3') return tournament
  const participant = tournament.participants.find(
    (item) => item.playerKey === 'local-player:javier villacreses',
  )
  invariant(participant, 'No se encontró a Javier Villacreses en Fecha 3.')
  let changed = false
  const rounds = tournament.rounds.map((round) => {
    let roundChanged = false
    const tables = round.tables.map((table) => {
      if (!table.participantIds.includes(participant.id)) return table
      const correct = (result: typeof table.results[number]) => {
        if (result.participantId !== participant.id) return result
        if (!result.rotating3 || !result.survived) return result
        changed = true
        roundChanged = true
        return { ...result, survived: false }
      }
      const results = table.results.map(correct)
      const savedResults = table.savedResults.map(correct)
      const tableChanged =
        results.some((result, index) => result !== table.results[index]) ||
        savedResults.some((result, index) => result !== table.savedResults[index])
      if (!tableChanged) return table
      return {
        ...table,
        results,
        savedResults,
        editCount: table.editCount + 1,
        lastSavedAt: RECONCILIATION_AT,
      }
    })
    return roundChanged
      ? {
          ...round,
          tables,
          wasEditedAfterFinish: true,
          lastEditedAt: RECONCILIATION_AT,
        }
      : round
  })
  invariant(changed, 'No se encontró el resultado de Javier Villacreses en Fecha 3.')
  return recalculateTournamentAchievementPoints(
    {
      ...tournament,
      rounds,
      financialReviewRequired: true,
      financialReviewResolvedAt: undefined,
      updatedAt: RECONCILIATION_AT,
    },
    tournament.achievementConfig,
  )
}

function moveBefore(values: string[], playerKey: string, beforePlayerKey: string): string[] {
  const next = values.filter((value) => value !== playerKey)
  const beforeIndex = next.indexOf(beforePlayerKey)
  if (beforeIndex < 0) return [...next, playerKey]
  next.splice(beforeIndex, 0, playerKey)
  return next
}

function correctMonthlyAward(
  ledger: LeaguePrizeLedger,
  leaguePeriodId: string,
  officialOrder: string[],
): LeaguePrizeLedger {
  const pabloOrtegaKey = 'local-player:pablo ortega'
  const pabloPradoKey = 'local-player:pablo prado'
  const correctedMovements = ledger.creditMovements.map((movement) =>
    movement.leaguePeriodId === leaguePeriodId &&
    movement.type === 'month_prize' &&
    movement.playerKey === pabloOrtegaKey &&
    movement.status === 'active'
      ? { ...movement, status: 'void' as const }
      : movement,
  )
  const correctedOrder = moveBefore(officialOrder, pabloPradoKey, pabloOrtegaKey)
  const hasPradoAward = correctedMovements.some(
    (movement) =>
      movement.leaguePeriodId === leaguePeriodId &&
      movement.type === 'month_prize' &&
      movement.playerKey === pabloPradoKey &&
      movement.status === 'active',
  )
  const pradoMovement: CreditMovement = {
    id: 'credit-movement-july-audit-month-pablo-prado',
    playerKey: pabloPradoKey,
    leaguePeriodId,
    type: 'month_prize',
    amount: 12000,
    reason: 'Crédito fin de liga · Liga Commander · Precon - Julio · 3° Pablo Prado · desempate administrativo',
    createdAt: RECONCILIATION_AT,
    status: 'active',
  }
  return {
    ...ledger,
    creditMovements: hasPradoAward
      ? correctedMovements
      : [...correctedMovements, pradoMovement],
    leaguePeriods: ledger.leaguePeriods.map((period) =>
      period.id !== leaguePeriodId
        ? period
        : {
            ...period,
            finalizedMonthlyPool: 60000,
            finalizedMonthlyAwards: [
              { playerKey: 'local-player:javier cisternas', position: 1, amount: 30000 },
              { playerKey: 'local-player:kevin arenas', position: 2, amount: 18000 },
              { playerKey: pabloPradoKey, position: 3, amount: 12000 },
            ],
            finalizedLeaderboardPlayerKeys: correctedOrder,
            administrativeLeaderboardPlayerKeys: correctedOrder,
            reviewRequired: true,
            financialReviewRequired: true,
            financialReviewResolvedAt: undefined,
            financialReviewLastImpactAt: RECONCILIATION_AT,
            updatedAt: RECONCILIATION_AT,
          },
    ),
  }
}

function importHistoricalUsage(
  ledger: LeaguePrizeLedger,
  leaguePeriodId: string,
): LeaguePrizeLedger {
  const usageByPlayer = new Map<string, number>([
    ['local-player:kevin arenas', 20000],
    ['local-player:pablo prado', 15000],
    ['local-player:pablo ortega', 10400],
    ['local-player:emilio gonzalez', 7200],
    [CANONICAL_RUBEN_KEY, 3200],
    ['local-player:pablo riadi', 2400],
  ])
  let creditMovements = ledger.creditMovements
  let sequence = 0
  usageByPlayer.forEach((amount, playerKey) => {
    const id = `credit-movement-july-audit-usage-${playerKey.replace(/[^a-z0-9]+/g, '-')}`
    if (creditMovements.some((movement) => movement.id === id)) return
    creditMovements = registerCreditUsage(
      creditMovements,
      playerKey,
      amount,
      'Uso histórico importado desde Julio.xlsx · total consolidado por jugador',
      () => id || `credit-movement-july-audit-${sequence++}`,
      RECONCILIATION_AT,
      { leaguePeriodId },
    )
    creditMovements = creditMovements.map((movement) =>
      movement.id === id
        ? {
            ...movement,
            sourceReference: `Julio.xlsx · uso consolidado · ${playerKey}`,
          }
        : movement,
    )
  })
  return { ...ledger, creditMovements }
}

const inputPath = process.argv[2]
const outputPath = process.argv[3]
invariant(inputPath && outputPath, 'Uso: vite-node scripts/reconcileJulyBackup.ts <entrada.json> <salida.json>')

const backupSource = fs.readFileSync(inputPath, 'utf8')
const backup = JSON.parse(backupSource) as BackupEnvelope
const imported = parseLocalBackup(backupSource)

let tournaments = imported.workspace.tournaments
let ledger = imported.ledger
const merged = mergeRubenIdentity(tournaments, ledger)
tournaments = merged.tournaments.map(correctJavierVillacreses)
ledger = merged.ledger

const league = ledger.leaguePeriods.find((period) => period.name === LEAGUE_NAME)
invariant(league, `No se encontró ${LEAGUE_NAME}.`)

ledger = addSpecialPointCorrection(
  ledger,
  league.id,
  'local-player:pablo ortega',
  'special-point-july-audit-pablo-ortega-plus-1',
  'Pablo Ortega',
)
ledger = addSpecialPointCorrection(
  ledger,
  league.id,
  'local-player:emilio gonzalez',
  'special-point-july-audit-emilio-gonzalez-plus-1',
  'Emilio Gonzalez',
)

const leagueDates = tournaments.filter((tournament) => tournament.leaguePeriodId === league.id)
const provisionalOrder = buildLeagueLeaderboard(
  leagueDates,
  { ...league, status: 'active', finalizedLeaderboardPlayerKeys: undefined },
  ledger,
).map((entry) => entry.playerKey)
ledger = correctMonthlyAward(ledger, league.id, provisionalOrder)

let prizeSequence = 0
leagueDates.forEach((tournament) => {
  const currentLeague = ledger.leaguePeriods.find((period) => period.id === league.id)
  ledger = consolidateTournamentPrizes(
    ledger,
    tournament,
    currentLeague,
    (prefix) => `${prefix}-july-audit-${++prizeSequence}`,
    RECONCILIATION_AT,
  )
})
ledger = importHistoricalUsage(ledger, league.id)
ledger = synchronizeFinishedTournamentPrizes(ledger, tournaments)

const synchronizedTwice = synchronizeFinishedTournamentPrizes(ledger, tournaments)
invariant(
  synchronizedTwice === ledger,
  'La sincronización repetida agregó o modificó movimientos de crédito.',
)

const allTournamentDifferences = tournaments
  .filter((tournament) => tournament.status === 'finished' && tournament.prizeMode !== 'none')
  .flatMap((tournament) => buildTournamentFinancialDifferences(
    tournament,
    ledger,
    ledger.leaguePeriods.find((period) => period.id === tournament.leaguePeriodId),
  ))
invariant(
  allTournamentDifferences.every((difference) => difference.difference === 0),
  `Existen premios de fecha sin sincronizar: ${JSON.stringify(allTournamentDifferences.filter((difference) => difference.difference !== 0))}`,
)

const augustLeague = ledger.leaguePeriods.find((period) => period.name.includes('Agosto'))
invariant(augustLeague, 'No se encontró la Liga Commander Precon Agosto.')
const augustDateMovements = ledger.creditMovements.filter(
  (movement) =>
    movement.leaguePeriodId === augustLeague.id &&
    movement.type === 'date_prize' &&
    movement.status === 'active',
)
const augustCredits = new Map<string, number>()
augustDateMovements.forEach((movement) => augustCredits.set(
  movement.playerKey,
  (augustCredits.get(movement.playerKey) ?? 0) + movement.amount,
))
invariant(augustDateMovements.length === 6, `Agosto debe contener 6 movimientos de fecha y contiene ${augustDateMovements.length}.`)
invariant(augustDateMovements.reduce((sum, movement) => sum + movement.amount, 0) === 18000, 'Los premios de fecha de agosto no suman $18.000.')
invariant(augustCredits.get('local-player:felipe marchant') === 7000, 'Felipe Marchant no suma $7.000 en fechas de agosto.')
invariant(augustCredits.get('local-player:pablo ortega') === 4400, 'Pablo Ortega no suma $4.400 en fechas de agosto.')
invariant(augustCredits.get('local-player:roberto cifuentes') === 1600, 'Roberto Cifuentes no suma $1.600 en fechas de agosto.')

const activeDateMovementKeys = ledger.creditMovements
  .filter((movement) => movement.type === 'date_prize' && movement.status === 'active')
  .map((movement) => `${movement.tournamentId}:${movement.playerKey}`)
invariant(
  new Set(activeDateMovementKeys).size === activeDateMovementKeys.length,
  'Existen movimientos date_prize activos duplicados por torneo y jugador.',
)

let correctedLeague = ledger.leaguePeriods.find((period) => period.id === league.id)
invariant(correctedLeague, 'La liga corregida desapareció del ledger.')
const tournamentDifferences = leagueDates.flatMap((leagueDate) =>
  buildTournamentFinancialDifferences(leagueDate, ledger, correctedLeague),
)
invariant(
  tournamentDifferences.every((difference) => difference.difference === 0),
  `Los créditos de fecha no coinciden con el recálculo: ${JSON.stringify(tournamentDifferences.filter((difference) => difference.difference !== 0))}`,
)
const officialMonthlyAwards = new Map(
  (correctedLeague.finalizedMonthlyAwards ?? []).map((award) => [award.playerKey, award.amount]),
)
const consolidatedMonthlyAwards = new Map<string, number>()
ledger.creditMovements
  .filter(
    (movement) =>
      movement.leaguePeriodId === correctedLeague.id &&
      movement.type === 'month_prize' &&
      movement.status === 'active',
  )
  .forEach((movement) => consolidatedMonthlyAwards.set(
    movement.playerKey,
    (consolidatedMonthlyAwards.get(movement.playerKey) ?? 0) + movement.amount,
  ))
const monthlyPlayerKeys = new Set([
  ...officialMonthlyAwards.keys(),
  ...consolidatedMonthlyAwards.keys(),
])
const leagueDifferences = [...monthlyPlayerKeys].map((playerKey) => ({
  playerKey,
  official: officialMonthlyAwards.get(playerKey) ?? 0,
  consolidated: consolidatedMonthlyAwards.get(playerKey) ?? 0,
  difference:
    (officialMonthlyAwards.get(playerKey) ?? 0) -
    (consolidatedMonthlyAwards.get(playerKey) ?? 0),
}))
invariant(
  leagueDifferences.every((difference) => difference.difference === 0),
  `Los créditos mensuales no coinciden con el cierre oficial: ${JSON.stringify(leagueDifferences.filter((difference) => difference.difference !== 0))}`,
)

tournaments = tournaments.map((tournament) =>
  tournament.leaguePeriodId === league.id
    ? {
        ...tournament,
        financialReviewRequired: false,
        financialReviewResolvedAt: RECONCILIATION_AT,
      }
    : tournament,
)
ledger = {
  ...ledger,
  leaguePeriods: ledger.leaguePeriods.map((period) =>
    period.id === league.id
      ? {
          ...period,
          reviewRequired: false,
          financialReviewRequired: false,
          financialReviewResolvedAt: RECONCILIATION_AT,
          updatedAt: RECONCILIATION_AT,
        }
      : period,
  ),
}
correctedLeague = ledger.leaguePeriods.find((period) => period.id === league.id)
invariant(correctedLeague, 'La liga corregida desapareció después de resolver la revisión.')
const leaderboard = buildLeagueLeaderboard(tournaments, correctedLeague, ledger)
const date3 = leagueDates.find((tournament) => tournament.name === 'Fecha 3')
const date4 = leagueDates.find((tournament) => tournament.name === 'Fecha 4')
invariant(date3 && date4, 'Faltan Fecha 3 o Fecha 4 en el respaldo.')
const date3Standing = calculateTournamentStanding(date3)
const date4Standing = calculateTournamentStanding(date4)
const date3Javier = date3.participants.find(
  (participant) => participant.playerKey === 'local-player:javier villacreses',
)
const date4Third = date4.participants.find(
  (participant) => participant.id === date4Standing[2]?.participantId,
)
const datePrizeMovements = ledger.creditMovements.filter(
  (movement) =>
    movement.leaguePeriodId === league.id &&
    movement.type === 'date_prize' &&
    movement.status === 'active',
)
const usageMovements = ledger.creditMovements.filter(
  (movement) =>
    movement.leaguePeriodId === league.id &&
    movement.type === 'usage' &&
    movement.status === 'active',
)
const pool = calculateLeaguePoolSummary(ledger.contributions, league.id)

invariant(date3Javier, 'No se encontró a Javier Villacreses después de la corrección.')
const date3JavierStanding = date3Standing.find(
  (entry) => entry.participantId === date3Javier.id,
)
invariant(
  date3JavierStanding?.achievementPoints === 1,
  `Javier Villacreses no quedó con 1 punto en Fecha 3: ${JSON.stringify(date3JavierStanding)}.`,
)
invariant(date4Third?.playerKey === CANONICAL_RUBEN_KEY, 'Ruben Muñoz no quedó tercero en Fecha 4.')
invariant(leaderboard[2]?.playerKey === 'local-player:pablo prado', 'Pablo Prado no quedó tercero oficial.')
invariant(datePrizeMovements.length === 15, `Se esperaban 15 premios de fecha y hay ${datePrizeMovements.length}.`)
invariant(datePrizeMovements.reduce((sum, movement) => sum + movement.amount, 0) === 60000, 'Los premios de fecha no suman $60.000.')
invariant(usageMovements.reduce((sum, movement) => sum + movement.amount, 0) === 58200, 'Los usos importados no suman $58.200.')
invariant(pool.monthlyFinalizedPool === 60000, 'El pozo mensual final no es $60.000.')
invariant(!tournaments.some((tournament) => tournament.participants.some((participant) => participant.playerKey === RUBEN_ALIAS_KEY)), 'La identidad Ruben Mu sigue duplicada.')
invariant(!correctedLeague.financialReviewRequired, 'La revisión financiera no quedó resuelta.')

const finalWorkspace = {
  ...imported.workspace,
  tournaments,
  playerRegistry: buildPlayerRegistry(
    tournaments,
    imported.workspace.playerRegistry.filter(
      (identity) => identity.playerKey !== RUBEN_ALIAS_KEY,
    ),
    RECONCILIATION_AT,
  ),
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(
  outputPath,
  createLocalBackup(finalWorkspace, ledger, backup.origin ?? 'local', RECONCILIATION_AT),
)

const balances = Object.fromEntries(
  [
    'local-player:javier cisternas',
    'local-player:kevin arenas',
    'local-player:pablo prado',
    'local-player:pablo ortega',
    'local-player:emilio gonzalez',
    CANONICAL_RUBEN_KEY,
    'local-player:pablo riadi',
  ].map((playerKey) => [playerKey, calculateAvailableCredit(ledger.creditMovements, playerKey)]),
)

console.log(JSON.stringify({
  outputPath,
  top5: leaderboard.slice(0, 5).map((entry) => ({
    position: entry.position,
    player: entry.playerName,
    leaguePoints: entry.leaguePoints,
    wins: entry.tableWins,
    achievements: entry.achievementPoints,
    eliminations: entry.eliminations,
    special: entry.specialLeaguePoints,
    monthlyPrize: entry.monthlyPrize,
  })),
  date4Third: date4Third.name,
  datePrizeTotal: datePrizeMovements.reduce((sum, movement) => sum + movement.amount, 0),
  usageTotal: usageMovements.reduce((sum, movement) => sum + movement.amount, 0),
  augustDatePrizeTotal: augustDateMovements.reduce((sum, movement) => sum + movement.amount, 0),
  augustDatePrizeMovementCount: augustDateMovements.length,
  augustCredits: Object.fromEntries(augustCredits),
  balances,
  financialReviewRequired: correctedLeague.financialReviewRequired,
  financialReviewResolvedAt: correctedLeague.financialReviewResolvedAt,
}, null, 2))
