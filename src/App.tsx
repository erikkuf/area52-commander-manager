import { useEffect, useMemo, useState } from 'react'
import { GlobalNavigation } from './components/GlobalNavigation'
import { registerCreditAdjustment, registerCreditUsage, voidCreditMovement } from './domain/credits'
import {
  applyDateCreditCorrections,
  applyTournamentDateCreditCorrections,
  consolidateTournamentPrizes,
  finishLeaguePeriod,
  markLeagueReviewRequired,
  refreshLeagueFinancialReviewRequirements,
  reopenLeaguePeriod,
  resolveLeagueFinancialReview,
  synchronizeFinishedTournamentPrizes,
} from './domain/league'
import { resolveTournamentFinancialReview } from './domain/competitive'
import {
  addLeaguePeriod,
  createDefaultLeaguePrizeLedger,
  removeProjectedContribution,
  updateLeaguePeriod as updateLeaguePeriodDomain,
  upsertLeaguePoolContribution,
} from './domain/prizes'
import type { LeaguePeriod, LeaguePrizeLedger, Tournament, TournamentConfigInput } from './domain/tournament'
import { createTournament } from './domain/tournamentOperations'
import {
  migrateLegacySpecialPointMovements,
  registerSpecialPointMovement,
  voidSpecialPointMovement,
} from './domain/specialPoints'
import { mergePlayerIdentities, resolveRegisteredPlayerKey } from './domain/playerRegistry'
import { importCreditUsageMovements } from './domain/creditImport'
import {
  createEmptyWorkspace,
  mergeLegacyTournament,
  upsertWorkspaceTournament,
  type AppWorkspace,
  type EventCreationType,
  type GlobalSection,
  type LeagueDetailTab,
  type TournamentManagerView,
} from './domain/workspace'
import { DashboardView } from './features/dashboard/DashboardView'
import { EventsView } from './features/events/EventsView'
import { HallOfFameView } from './features/hallOfFame/HallOfFameView'
import { LeagueDetailView } from './features/leagues/LeagueDetailView'
import { LeaguesView } from './features/leagues/LeaguesView'
import { CreateTournamentView } from './features/setup/CreateTournamentView'
import { GlobalSettingsView } from './features/settings/GlobalSettingsView'
import { TournamentManager } from './features/tournament/TournamentManager'
import { createBrowserAppWorkspaceRepository } from './services/localStorageAppWorkspaceRepository'
import { createBrowserAppStateRepository } from './services/localStorageAppStateRepository'
import { createBrowserLeaguePrizeRepository } from './services/localStorageLeaguePrizeRepository'
import { createBrowserTournamentRepository } from './services/localStorageTournamentRepository'
import { createBrowserChampionPhotoStorage } from './services/indexedDbChampionPhotoStorage'
import {
  createLocalBackup,
  downloadLocalBackup,
  parseLocalBackup,
} from './services/localBackup'

type StorageStatus = 'saving' | 'saved' | 'error'

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
}

function syncLedgerWithTournaments(
  ledger: LeaguePrizeLedger,
  tournaments: Tournament[],
): LeaguePrizeLedger {
  return tournaments.reduce((current, tournament) => {
    if (tournament.type !== 'league_date' || tournament.prizeMode !== 'league_auto') {
      return removeProjectedContribution(current, tournament.id)
    }
    const leaguePeriod = current.leaguePeriods.find(
      (period) => period.id === tournament.leaguePeriodId,
    )
    if (!leaguePeriod || leaguePeriod.status === 'finished') return current
    return upsertLeaguePoolContribution(current, tournament, leaguePeriod)
  }, ledger)
}

function synchronizeLedgerWithWorkspace(
  ledger: LeaguePrizeLedger,
  tournaments: Tournament[],
): LeaguePrizeLedger {
  return synchronizeFinishedTournamentPrizes(
    syncLedgerWithTournaments(ledger, tournaments),
    tournaments,
  )
}

export function App() {
  const tournamentRepository = useMemo(() => createBrowserTournamentRepository(), [])
  const appStateRepository = useMemo(() => createBrowserAppStateRepository(), [])
  const workspaceRepository = useMemo(() => createBrowserAppWorkspaceRepository(), [])
  const leaguePrizeRepository = useMemo(() => createBrowserLeaguePrizeRepository(), [])
  const championPhotoStorage = useMemo(() => createBrowserChampionPhotoStorage(), [])
  const [workspace, setWorkspace] = useState<AppWorkspace | undefined>(undefined)
  const [leagueLedger, setLeagueLedger] = useState<LeaguePrizeLedger | undefined>(undefined)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('saved')
  const [hallOfFameEditLeagueId, setHallOfFameEditLeagueId] = useState<string | undefined>()

  useEffect(() => {
    let mounted = true
    const restore = async () => {
      const unifiedState = await appStateRepository.getState()
      const [savedWorkspace, legacyTournament, savedLedger] = unifiedState
        ? [unifiedState.workspace, null, unifiedState.ledger] as const
        : await Promise.all([
            workspaceRepository.getWorkspace(),
            tournamentRepository.getCurrentTournament(),
            leaguePrizeRepository.getLedger(),
          ])
        if (!mounted) return
        const restoredWorkspace = mergeLegacyTournament(
          savedWorkspace ?? createEmptyWorkspace(),
          legacyTournament,
        )
        const synchronizedLedger = synchronizeLedgerWithWorkspace(
          savedLedger ?? createDefaultLeaguePrizeLedger(),
          restoredWorkspace.tournaments,
        )
        const restoredLedger = refreshLeagueFinancialReviewRequirements(
          migrateLegacySpecialPointMovements(
            restoredWorkspace.tournaments,
            synchronizedLedger,
          ),
          restoredWorkspace.tournaments,
        )
        setWorkspace(restoredWorkspace)
        setLeagueLedger(restoredLedger)
        if (!unifiedState) {
          await appStateRepository.saveState({
            workspace: restoredWorkspace,
            ledger: restoredLedger,
          })
        }
      }
    restore()
      .catch(() => {
        if (!mounted) return
        setWorkspace(createEmptyWorkspace())
        setLeagueLedger(createDefaultLeaguePrizeLedger())
        setStorageStatus('error')
      })
    return () => { mounted = false }
  }, [appStateRepository, leaguePrizeRepository, tournamentRepository, workspaceRepository])

  useEffect(() => {
    if (!workspace || !leagueLedger) return
    const synchronizedLedger = synchronizeLedgerWithWorkspace(
      leagueLedger,
      workspace.tournaments,
    )
    if (synchronizedLedger !== leagueLedger) {
      setLeagueLedger(synchronizedLedger)
      return
    }
    setStorageStatus('saving')
    appStateRepository.saveState({ workspace, ledger: leagueLedger })
      .then(() => setStorageStatus('saved'))
      .catch(() => setStorageStatus('error'))
  }, [appStateRepository, leagueLedger, workspace])

  if (!workspace || !leagueLedger) {
    return <div className="app-loading">Cargando datos locales…</div>
  }

  const updateNavigation = (changes: Partial<AppWorkspace['navigation']>) => {
    setWorkspace((current) => current ? {
      ...current,
      navigation: { ...current.navigation, ...changes },
    } : current)
  }

  const navigate = (section: GlobalSection) => {
    setHallOfFameEditLeagueId(undefined)
    updateNavigation({
      globalSection: section,
      openedTournamentId: undefined,
      creationType: undefined,
      selectedLeaguePeriodId: undefined,
    })
    setFeedback(null)
  }

  const openTournament = (tournamentId: string) => {
    const tournament = workspace.tournaments.find((item) => item.id === tournamentId)
    if (!tournament) return
    updateNavigation({
      openedTournamentId: tournamentId,
      creationType: undefined,
      managerView: tournament.status === 'finished' ? 'standing' : 'tables',
    })
    setFeedback(null)
  }

  const openLeague = (leaguePeriodId: string) => {
    updateNavigation({
      globalSection: 'leagues',
      selectedLeaguePeriodId: leaguePeriodId,
      leagueDetailTab: 'summary',
      openedTournamentId: undefined,
      creationType: undefined,
    })
    setFeedback(null)
  }

  const openChampionEditor = (leaguePeriodId: string) => {
    setHallOfFameEditLeagueId(leaguePeriodId)
    updateNavigation({
      globalSection: 'hall_of_fame',
      selectedLeaguePeriodId: undefined,
      openedTournamentId: undefined,
      creationType: undefined,
    })
    setFeedback(null)
  }

  const startCreation = (preferredType?: EventCreationType) => {
    const type = preferredType ?? (
      leagueLedger.leaguePeriods.some((period) => period.status === 'active')
        ? 'league_date'
        : 'independent'
    )
    if (
      type === 'league_date' &&
      !leagueLedger.leaguePeriods.some((period) => period.status === 'active')
    ) {
      updateNavigation({ globalSection: 'settings', creationType: undefined })
      setFeedback('Crea primero un período de liga activo.')
      return
    }
    updateNavigation({ globalSection: 'home', creationType: type, openedTournamentId: undefined })
    setFeedback(null)
  }

  const handleCreateTournament = (config: TournamentConfigInput) => {
    try {
      const leaguePeriod = leagueLedger.leaguePeriods.find(
        (period) => period.id === config.leaguePeriodId,
      )
      const tournament = createTournament(config, undefined, leaguePeriod)
      setWorkspace((current) => current ? {
        ...upsertWorkspaceTournament(current, tournament),
        navigation: {
          ...current.navigation,
          creationType: undefined,
          openedTournamentId: tournament.id,
          managerView: 'tables',
        },
      } : current)
      setLeagueLedger((current) => current ? syncLedgerWithTournaments(current, [tournament]) : current)
      setFeedback(null)
    } catch (error) {
      setFeedback(messageFromError(error))
    }
  }

  const handleTournamentChange = (tournament: Tournament) => {
    setWorkspace((current) => current ? upsertWorkspaceTournament(current, tournament) : current)
    setLeagueLedger((current) => {
      if (!current) return current
      const synchronized = synchronizeLedgerWithWorkspace(current, [tournament])
      if (tournament.status !== 'finished') return synchronized
      const leaguePeriod = synchronized.leaguePeriods.find(
        (period) => period.id === tournament.leaguePeriodId,
      )
      const consolidated = consolidateTournamentPrizes(synchronized, tournament, leaguePeriod)
      return tournament.financialReviewRequired && tournament.leaguePeriodId
        ? markLeagueReviewRequired(consolidated, tournament.leaguePeriodId, tournament.updatedAt)
        : consolidated
    })
  }

  const handleUpdateLeaguePeriod = (
    leaguePeriod: LeaguePeriod,
    confirmFinishedSensitiveChange = false,
  ): string | null => {
    try {
      setLeagueLedger(updateLeaguePeriodDomain(leagueLedger, leaguePeriod, { confirmFinishedSensitiveChange }))
      setFeedback(null)
      return null
    } catch (error) {
      const message = messageFromError(error)
      setFeedback(message)
      return message
    }
  }

  const openedTournament = workspace.tournaments.find(
    (tournament) => tournament.id === workspace.navigation.openedTournamentId,
  )

  if (openedTournament) {
    return (
      <TournamentManager
        key={openedTournament.id}
        tournament={openedTournament}
        leaguePeriods={leagueLedger.leaguePeriods}
        ledger={leagueLedger}
        storageStatus={storageStatus}
        activeView={workspace.navigation.managerView}
        onActiveViewChange={(managerView: TournamentManagerView) => updateNavigation({ managerView })}
        onTournamentChange={handleTournamentChange}
        onHistoricalCorrection={(leaguePeriodId) => setLeagueLedger((current) => current ? markLeagueReviewRequired(current, leaguePeriodId) : current)}
        onApplyDateCreditCorrections={() => {
          try {
            setLeagueLedger((current) => {
              if (!current) return current
              const leaguePeriod = current.leaguePeriods.find(
                (period) => period.id === openedTournament.leaguePeriodId,
              )
              return applyTournamentDateCreditCorrections(
                current,
                openedTournament,
                leaguePeriod,
              )
            })
            return null
          } catch (error) {
            return messageFromError(error)
          }
        }}
        resolvePlayerKey={(name) => resolveRegisteredPlayerKey(workspace.playerRegistry, name)}
        onExit={() => navigate('home')}
      />
    )
  }

  const selectedLeague = leagueLedger.leaguePeriods.find(
    (period) => period.id === workspace.navigation.selectedLeaguePeriodId,
  )

  return (
    <div className="global-shell">
      <GlobalNavigation
        activeSection={workspace.navigation.globalSection}
        storageStatus={storageStatus}
        onNavigate={navigate}
      />

      {workspace.navigation.creationType ? (
        <CreateTournamentView
          key={workspace.navigation.creationType}
          embedded
          defaultType={workspace.navigation.creationType}
          error={feedback}
          leaguePeriods={leagueLedger.leaguePeriods}
          onCancel={() => navigate('home')}
          onCreate={handleCreateTournament}
        />
      ) : selectedLeague && workspace.navigation.globalSection === 'leagues' ? (
        <LeagueDetailView
          leaguePeriod={selectedLeague}
          tournaments={workspace.tournaments}
          ledger={leagueLedger}
          playerRegistry={workspace.playerRegistry}
          activeTab={workspace.navigation.leagueDetailTab}
          onTabChange={(leagueDetailTab: LeagueDetailTab) => updateNavigation({ leagueDetailTab })}
          onBack={() => updateNavigation({ selectedLeaguePeriodId: undefined })}
          onOpenTournament={openTournament}
          onFinalize={(administrativeOrder) => {
            try {
              setLeagueLedger(finishLeaguePeriod(
                leagueLedger,
                selectedLeague.id,
                workspace.tournaments,
                undefined,
                undefined,
                administrativeOrder,
              ))
              setFeedback(null)
              return null
            } catch (error) {
              const message = messageFromError(error)
              setFeedback(message)
              return message
            }
          }}
          onReopen={() => {
            try {
              setLeagueLedger(reopenLeaguePeriod(leagueLedger, selectedLeague.id))
              setFeedback(null)
              return null
            } catch (error) {
              const message = messageFromError(error)
              setFeedback(message)
              return message
            }
          }}
          onResolveFinancialReview={() => {
            const now = new Date().toISOString()
            setWorkspace((current) => current ? {
              ...current,
              tournaments: current.tournaments.map((tournament) =>
                tournament.leaguePeriodId === selectedLeague.id && tournament.financialReviewRequired
                  ? resolveTournamentFinancialReview(tournament, now)
                  : tournament,
              ),
            } : current)
            setLeagueLedger((current) => current
              ? resolveLeagueFinancialReview(current, selectedLeague.id, now)
              : current)
          }}
          onSynchronizeDatePrizes={() => setLeagueLedger((current) => current
            ? synchronizeFinishedTournamentPrizes(current, workspace.tournaments)
            : current)}
          onApplyDateCreditCorrections={() => {
            try {
              setLeagueLedger((current) => current
                ? applyDateCreditCorrections(
                    current,
                    workspace.tournaments,
                    selectedLeague,
                  )
                : current)
              return null
            } catch (error) {
              return messageFromError(error)
            }
          }}
          onImportCreditUsage={(preview) => {
            try {
              setLeagueLedger((current) => current ? {
                ...current,
                creditMovements: importCreditUsageMovements(
                  current.creditMovements,
                  preview,
                  selectedLeague.id,
                ),
              } : current)
              return null
            } catch (error) {
              return messageFromError(error)
            }
          }}
          onRegisterCreditMovement={(playerKey, amount, reason, kind) => {
            try {
              setLeagueLedger({
                ...leagueLedger,
                creditMovements: kind === 'usage'
                  ? registerCreditUsage(
                      leagueLedger.creditMovements,
                      playerKey,
                      amount,
                      reason,
                      undefined,
                      undefined,
                      { leaguePeriodId: selectedLeague.id },
                    )
                  : registerCreditAdjustment(
                      leagueLedger.creditMovements,
                      playerKey,
                      amount,
                      kind === 'positive_adjustment' ? 'positive' : 'negative',
                      reason,
                      undefined,
                      undefined,
                      { leaguePeriodId: selectedLeague.id },
                    ),
              })
              return null
            } catch (error) {
              return messageFromError(error)
            }
          }}
          onVoidCreditMovement={(movementId) => {
            try {
              setLeagueLedger({
                ...leagueLedger,
                creditMovements: voidCreditMovement(leagueLedger.creditMovements, movementId),
              })
              return null
            } catch (error) {
              return messageFromError(error)
            }
          }}
          onRegisterSpecialPoint={(playerKey, amount, reason) => {
            try {
              setLeagueLedger((current) => {
                if (!current) return current
                const period = current.leaguePeriods.find((item) => item.id === selectedLeague.id)
                const specialPointMovements = registerSpecialPointMovement(
                  current.specialPointMovements,
                  selectedLeague.id,
                  playerKey,
                  amount,
                  reason,
                )
                const next = { ...current, specialPointMovements }
                return period && (period.status === 'finished' || period.wasReopened)
                  ? markLeagueReviewRequired(next, selectedLeague.id)
                  : next
              })
              return null
            } catch (error) {
              return messageFromError(error)
            }
          }}
          onVoidSpecialPoint={(movementId) => {
            try {
              setLeagueLedger((current) => {
                if (!current) return current
                const period = current.leaguePeriods.find((item) => item.id === selectedLeague.id)
                const next = {
                  ...current,
                  specialPointMovements: voidSpecialPointMovement(
                    current.specialPointMovements,
                    movementId,
                  ),
                }
                return period && (period.status === 'finished' || period.wasReopened)
                  ? markLeagueReviewRequired(next, selectedLeague.id)
                  : next
              })
              return null
            } catch (error) {
              return messageFromError(error)
            }
          }}
          onOpenChampionEditor={() => openChampionEditor(selectedLeague.id)}
        />
      ) : workspace.navigation.globalSection === 'home' ? (
        <DashboardView
          tournaments={workspace.tournaments}
          ledger={leagueLedger}
          onOpenLeague={openLeague}
          onOpenTournament={openTournament}
          onCreateTournament={() => startCreation()}
        />
      ) : workspace.navigation.globalSection === 'leagues' ? (
        <LeaguesView tournaments={workspace.tournaments} ledger={leagueLedger} onOpenLeague={openLeague} />
      ) : workspace.navigation.globalSection === 'events' ? (
        <EventsView tournaments={workspace.tournaments} onOpenTournament={openTournament} onCreateTournament={() => startCreation('independent')} />
      ) : workspace.navigation.globalSection === 'hall_of_fame' ? (
        <HallOfFameView
          tournaments={workspace.tournaments}
          ledger={leagueLedger}
          photoStorage={championPhotoStorage}
          initialEditLeaguePeriodId={hallOfFameEditLeagueId}
          onInitialEditHandled={() => setHallOfFameEditLeagueId(undefined)}
          onLedgerChange={setLeagueLedger}
          onOpenLeague={openLeague}
        />
      ) : (
        <GlobalSettingsView
          tournaments={workspace.tournaments}
          ledger={leagueLedger}
          playerRegistry={workspace.playerRegistry}
          error={feedback}
          onCreateLeaguePeriod={(leaguePeriod) => {
            try {
              setLeagueLedger(addLeaguePeriod(leagueLedger, leaguePeriod))
              setFeedback(null)
              return null
            } catch (error) {
              const message = messageFromError(error)
              setFeedback(message)
              return message
            }
          }}
          onUpdateLeaguePeriod={handleUpdateLeaguePeriod}
          onExportBackup={() => {
            const serialized = createLocalBackup(workspace, leagueLedger, window.location.origin)
            downloadLocalBackup(
              serialized,
              `area52-commander-manager-backup-${new Date().toISOString().slice(0, 10)}.json`,
            )
          }}
          onImportBackup={async (serialized) => {
            try {
              const imported = parseLocalBackup(serialized)
              const synchronizedLedger = refreshLeagueFinancialReviewRequirements(
                synchronizeLedgerWithWorkspace(
                  imported.ledger,
                  imported.workspace.tournaments,
                ),
                imported.workspace.tournaments,
              )
              const importedWorkspace = {
                ...imported.workspace,
                navigation: {
                  ...imported.workspace.navigation,
                  globalSection: 'settings' as const,
                  openedTournamentId: undefined,
                  selectedLeaguePeriodId: undefined,
                  creationType: undefined,
                },
              }
              await appStateRepository.saveState({
                workspace: importedWorkspace,
                ledger: synchronizedLedger,
              })
              setWorkspace(importedWorkspace)
              setLeagueLedger(synchronizedLedger)
              setFeedback(null)
              return null
            } catch (importError) {
              return messageFromError(importError)
            }
          }}
          onMergePlayerIdentities={(sourcePlayerKey, targetPlayerKey, canonicalName) => {
            try {
              const merged = mergePlayerIdentities(
                workspace.tournaments,
                leagueLedger,
                workspace.playerRegistry,
                sourcePlayerKey,
                targetPlayerKey,
                canonicalName,
              )
              setWorkspace({
                ...workspace,
                tournaments: merged.tournaments,
                playerRegistry: merged.registry,
              })
              setLeagueLedger(merged.ledger)
              return null
            } catch (error) {
              return messageFromError(error)
            }
          }}
        />
      )}
    </div>
  )
}
