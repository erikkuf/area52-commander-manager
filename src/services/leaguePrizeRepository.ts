import type { LeaguePrizeLedger } from '../domain/tournament'

export interface LeaguePrizeRepository {
  getLedger(): Promise<LeaguePrizeLedger | null>
  saveLedger(ledger: LeaguePrizeLedger): Promise<void>
}
