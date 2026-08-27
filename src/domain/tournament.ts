export type TournamentStatus = 'setup' | 'active' | 'rounds_completed' | 'finished'
export type TournamentType = 'league_date' | 'independent'
export type RoundStatus = 'pending' | 'active' | 'finished'
export type TableStatus = 'pending' | 'saved' | 'edited'
export type PrizeMode = 'none' | 'league_auto' | 'manual_credit'
export type PairingMode = 'balanced_random' | 'swiss'
export type LeaguePeriodStatus = 'active' | 'finished'
export type LeaguePoolContributionStatus = 'projected' | 'finalized'
export type RotatingAchievementId =
  | 'rotating1'
  | 'rotating2'
  | 'rotating3'
  | 'rotating4'
  | 'rotating5'

export interface Participant {
  id: string
  playerKey: string
  name: string
  active: boolean
  isGhost: boolean
}

export interface PlayerResult {
  participantId: string
  rotating1: boolean
  rotating2: boolean
  rotating3: boolean
  rotating4?: boolean
  rotating5?: boolean
  wonTable: boolean
  eliminations: number
  survived: boolean
  achievementPoints: number
  specialLeaguePoints: number
}

export interface CommanderTable {
  id: string
  roundId: string
  tableNumber: number
  participantIds: string[]
  status: TableStatus
  results: PlayerResult[]
  savedResults: PlayerResult[]
  editCount: number
  lastSavedAt?: string
}

export interface Round {
  id: string
  tournamentId: string
  number: number
  status: RoundStatus
  tables: CommanderTable[]
  isCorrectionMode: boolean
  wasEditedAfterFinish: boolean
  lastEditedAt?: string
}

export interface RotatingAchievementConfig {
  id: RotatingAchievementId
  label: string
  points: number
}

export interface AchievementRule {
  enabled: boolean
  points: number
}

export interface AchievementConfig {
  rotating1: AchievementRule
  rotating2: AchievementRule
  rotating3: AchievementRule
  rotating4?: AchievementRule
  rotating5?: AchievementRule
  win: AchievementRule
  elimination: AchievementRule
  survival: AchievementRule
}

export interface CreditPrizeConfig {
  prizePool: number
  percentagesByPosition: number[]
}

export interface LeagueContributionConfig {
  contributionPerPlayer: number
  dateContributionPerPlayer: number
  monthlyContributionPerPlayer: number
}

export interface LeaguePeriod {
  id: string
  name: string
  startDate: string
  endDate: string
  status: LeaguePeriodStatus
  contributionConfig: LeagueContributionConfig
  datePrizePercentages: number[]
  monthlyPrizePercentages: number[]
  defaultAchievementConfig: AchievementConfig
  defaultRotatingAchievements: RotatingAchievementConfig[]
  createdAt: string
  updatedAt: string
  finishedAt?: string
  reviewRequired?: boolean
  financialReviewRequired: boolean
  financialReviewResolvedAt?: string
  financialReviewLastImpactAt?: string
  wasReopened: boolean
  reopenedAt?: string
  finalizedMonthlyPool?: number
  finalizedMonthlyAwards?: LeagueMonthlyAward[]
  latestTheoreticalMonthlyAwards?: LeagueMonthlyAward[]
  finalizedLeaderboardPlayerKeys?: string[]
  administrativeLeaderboardPlayerKeys?: string[]
}

export interface LeagueMonthlyAward {
  playerKey: string
  position: number
  amount: number
}

export interface LeaguePoolContribution {
  id: string
  leaguePeriodId: string
  tournamentId: string
  playerCount: number
  datePoolAmount: number
  monthlyPoolContribution: number
  status: LeaguePoolContributionStatus
  createdAt: string
  finalizedAt?: string
}

export interface ChampionPhotoReference {
  id: string
  fileName: string
  mimeType: string
  storageKey: string
}

export interface LeagueChampionSnapshot {
  id: string
  leaguePeriodId: string
  leagueName: string
  playerKey: string
  playerName: string
  finalPosition: 1
  leaguePoints: number
  achievementPoints: number
  specialLeaguePoints: number
  tableWins: number
  eliminations: number
  tournamentsPlayed: number
  championPhoto?: ChampionPhotoReference
  commanderName?: string
  deckName?: string
  deckUrl?: string
  createdAt: string
  updatedAt?: string
  sourceClosedAt?: string
}

export interface LeaguePrizeLedger {
  leaguePeriods: LeaguePeriod[]
  contributions: LeaguePoolContribution[]
  creditMovements: CreditMovement[]
  specialPointMovements: SpecialPointMovement[]
  championSnapshots: LeagueChampionSnapshot[]
}

export type SpecialPointMovementStatus = 'active' | 'void'

export interface SpecialPointMovement {
  id: string
  leaguePeriodId: string
  playerKey: string
  amount: number
  reason?: string
  createdAt: string
  status: SpecialPointMovementStatus
  voidedAt?: string
}

export type CreditMovementType =
  | 'date_prize'
  | 'month_prize'
  | 'usage'
  | 'positive_adjustment'
  | 'negative_adjustment'

export type CreditMovementStatus = 'active' | 'void'

export interface CreditMovement {
  id: string
  playerKey: string
  tournamentId?: string
  leaguePeriodId?: string
  type: CreditMovementType
  amount: number
  reason: string
  createdAt: string
  status: CreditMovementStatus
  sourceReference?: string
}

export interface Tournament {
  id: string
  type: TournamentType
  name: string
  date: string
  totalRounds: number
  pairingMode: PairingMode
  currentRound: number
  status: TournamentStatus
  prizeMode: PrizeMode
  leaguePeriodId?: string
  prizePlayerCount: number
  prizeParticipantIds: string[]
  rotatingAchievements: RotatingAchievementConfig[]
  achievementConfig: AchievementConfig
  dateCreditConfig: CreditPrizeConfig
  participants: Participant[]
  rounds: Round[]
  ghostPairingAuthorized: boolean
  financialReviewRequired: boolean
  financialReviewResolvedAt?: string
  finishedAt?: string
  createdAt: string
  updatedAt: string
}

export interface TournamentConfigInput {
  name: string
  date: string
  totalRounds: number
  pairingMode?: PairingMode
  rotating1: string
  rotating2: string
  rotating3: string
  rotatingAchievements?: RotatingAchievementConfig[]
  prizePool: number
  percentagesByPosition: number[]
  prizeMode?: PrizeMode
  type?: TournamentType
  leaguePeriodId?: string
  achievementConfig?: AchievementConfig
}

export type IdFactory = (prefix: string) => string
