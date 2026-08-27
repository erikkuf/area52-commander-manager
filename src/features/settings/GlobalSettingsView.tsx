import { useState } from 'react'
import { CloseIcon } from '../../components/icons'
import { getLeagueDates } from '../../domain/catalog'
import {
  calculateLeaguePoolSummary,
  createDefaultLeaguePeriod,
} from '../../domain/prizes'
import type { LeaguePeriod, LeaguePrizeLedger, Tournament } from '../../domain/tournament'
import type { PlayerIdentity } from '../../domain/playerRegistry'
import { formatCurrency } from '../../utils/format'
import { LeaguePeriodSettings } from './LeaguePeriodSettings'

interface GlobalSettingsViewProps {
  tournaments: Tournament[]
  ledger: LeaguePrizeLedger
  playerRegistry: PlayerIdentity[]
  error: string | null
  onCreateLeaguePeriod: (leaguePeriod: LeaguePeriod) => string | null
  onUpdateLeaguePeriod: (
    leaguePeriod: LeaguePeriod,
    confirmFinishedSensitiveChange?: boolean,
  ) => string | null
  onExportBackup: () => void
  onImportBackup: (serialized: string) => Promise<string | null>
  onMergePlayerIdentities: (
    sourcePlayerKey: string,
    targetPlayerKey: string,
    canonicalName: string,
  ) => string | null
}

export function GlobalSettingsView({
  tournaments,
  ledger,
  playerRegistry,
  error,
  onCreateLeaguePeriod,
  onUpdateLeaguePeriod,
  onExportBackup,
  onImportBackup,
  onMergePlayerIdentities,
}: GlobalSettingsViewProps) {
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; league: LeaguePeriod } | null>(null)
  const [pendingFinishedUpdate, setPendingFinishedUpdate] = useState<LeaguePeriod | null>(null)
  const [backupFeedback, setBackupFeedback] = useState<string | null>(null)
  const [showIdentityManager, setShowIdentityManager] = useState(false)
  const [sourcePlayerKey, setSourcePlayerKey] = useState('')
  const [targetPlayerKey, setTargetPlayerKey] = useState('')
  const [canonicalName, setCanonicalName] = useState('')
  const activePeriods = ledger.leaguePeriods.filter((period) => period.status === 'active')
  const finishedPeriods = ledger.leaguePeriods.filter((period) => period.status === 'finished')

  const submitLeague = (leaguePeriod: LeaguePeriod) => {
    if (editor?.mode === 'create') {
      const submitError = onCreateLeaguePeriod(leaguePeriod)
      if (!submitError) setEditor(null)
      return
    }
    if (leaguePeriod.status === 'finished') {
      setPendingFinishedUpdate(leaguePeriod)
      return
    }
    const submitError = onUpdateLeaguePeriod(leaguePeriod)
    if (!submitError) setEditor(null)
  }

  const renderLeagueGroup = (title: string, periods: LeaguePeriod[]) => (
    <section className="global-settings-league-group">
      <div className="section-heading"><div><p className="section-kicker">{title}</p><h2>{title === 'En curso' ? 'Ligas activas' : 'Ligas finalizadas'}</h2></div><span className="count-pill">{periods.length}</span></div>
      {periods.length === 0 ? (
        <div className="global-empty-state global-empty-state--card"><p>No hay ligas en esta sección.</p></div>
      ) : (
        <div className="catalog-grid">
          {periods.map((leaguePeriod) => {
            const dates = getLeagueDates(tournaments, leaguePeriod.id)
            const pools = calculateLeaguePoolSummary(ledger.contributions, leaguePeriod.id)
            return (
              <article className="catalog-card" key={leaguePeriod.id}>
                <div className="catalog-card__topline"><span className={`state-pill state-pill--${leaguePeriod.status}`}>{leaguePeriod.status === 'active' ? 'En curso' : 'Finalizada'}</span><span>{leaguePeriod.startDate} → {leaguePeriod.endDate}</span></div>
                <h2>{leaguePeriod.name}</h2>
                <dl className="catalog-facts">
                  <div><dt>Fechas</dt><dd>{dates.length}</dd></div>
                  <div><dt>Confirmado</dt><dd>{formatCurrency.format(pools.monthlyFinalizedPool)}</dd></div>
                  <div><dt>{leaguePeriod.status === 'finished' ? 'Pozo final' : 'Proyectado'}</dt><dd>{formatCurrency.format(leaguePeriod.finalizedMonthlyPool ?? pools.monthlyProjectedPool)}</dd></div>
                  <div><dt>Revisión</dt><dd>{leaguePeriod.reviewRequired ? 'Requerida' : 'Al día'}</dd></div>
                </dl>
                <button className="secondary-button panel-action" type="button" onClick={() => setEditor({ mode: 'edit', league: leaguePeriod })}>Modificar liga</button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )

  return (
    <section className="global-page" aria-labelledby="global-settings-title">
      <div className="global-page__heading">
        <div><p className="section-kicker">Administración local</p><h1 id="global-settings-title">Configuración</h1><p>Configuración global, ligas y valores por defecto. Los históricos no cambian silenciosamente.</p></div>
        <button className="primary-button" type="button" onClick={() => setEditor({ mode: 'create', league: createDefaultLeaguePeriod() })}>+ Crear liga</button>
      </div>

      <div className="global-settings-summary">
        <div><span>Torneos guardados</span><strong>{tournaments.length}</strong></div>
        <div><span>Ligas activas</span><strong>{activePeriods.length}</strong></div>
        <div><span>Ligas finalizadas</span><strong>{finishedPeriods.length}</strong></div>
        <div><span>Movimientos especiales</span><strong>{ledger.specialPointMovements.length}</strong></div>
      </div>
      <section className="backup-settings-card" aria-labelledby="backup-settings-title">
        <div>
          <p className="section-kicker">Seguridad de datos</p>
          <h2 id="backup-settings-title">Respaldo local</h2>
          <p>Exporta todas las ligas, eventos, resultados y movimientos, o restaura un respaldo validado.</p>
        </div>
        <div className="backup-settings-actions">
          <button className="secondary-button" type="button" onClick={() => {
            onExportBackup()
            setBackupFeedback('Respaldo exportado correctamente.')
          }}>Exportar respaldo</button>
          <label className="primary-button backup-import-button">
            Importar respaldo
            <input
              accept="application/json,.json"
              type="file"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                if (!window.confirm('¿Restaurar este respaldo? Reemplazará los datos locales actuales después de validarlos.')) return
                const importError = await onImportBackup(await file.text())
                setBackupFeedback(importError ?? 'Respaldo restaurado. Revisa la información antes de continuar operando.')
              }}
            />
          </label>
        </div>
        {backupFeedback && <div className={backupFeedback.includes('correctamente') || backupFeedback.includes('restaurado') ? 'form-message form-message--success' : 'form-message form-message--error'}>{backupFeedback}</div>}
      </section>
      <section className="backup-settings-card" aria-labelledby="identity-settings-title">
        <div>
          <p className="section-kicker">Jugadores</p>
          <h2 id="identity-settings-title">Identidades y alias</h2>
          <p>{playerRegistry.length} identidades estables. Unificar conserva resultados y movimientos bajo una misma persona.</p>
        </div>
        <div className="backup-settings-actions">
          <button className="secondary-button" type="button" onClick={() => {
            setSourcePlayerKey(playerRegistry[0]?.playerKey ?? '')
            setTargetPlayerKey(playerRegistry[1]?.playerKey ?? '')
            setCanonicalName(playerRegistry[1]?.canonicalName ?? '')
            setShowIdentityManager(true)
          }}>Administrar identidades</button>
        </div>
      </section>
      {error && <div className="form-message form-message--error section-message">{error}</div>}
      {renderLeagueGroup('En curso', activePeriods)}
      {renderLeagueGroup('Finalizadas', finishedPeriods)}

      {editor && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="league-editor-title">
          <button className="modal-backdrop" type="button" aria-label="Cerrar" onClick={() => setEditor(null)} />
          <section className="admin-modal admin-modal--wide">
            <div className="modal-header"><div><p className="section-kicker">Ligas</p><h2 id="league-editor-title">{editor.mode === 'create' ? 'Crear liga' : 'Modificar liga'}</h2></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={() => setEditor(null)}><CloseIcon /></button></div>
            <LeaguePeriodSettings
              key={`${editor.mode}-${editor.league.id}-${editor.league.updatedAt}`}
              leaguePeriod={editor.league}
              contributions={ledger.contributions}
              error={error}
              submitLabel={editor.mode === 'create' ? 'Crear liga' : 'Guardar cambios'}
              onUpdate={submitLeague}
            />
          </section>
        </div>
      )}

      {pendingFinishedUpdate && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="finished-league-warning-title">
          <button className="modal-backdrop" type="button" aria-label="Cancelar" onClick={() => setPendingFinishedUpdate(null)} />
          <section className="swap-modal">
            <div className="modal-header"><div><p className="section-kicker">Confirmación administrativa</p><h2 id="finished-league-warning-title">Modificar liga finalizada</h2></div></div>
            <p className="modal-copy">Este cambio puede afectar la interpretación deportiva o financiera. Las fechas, Leaderboards, créditos, campeón y snapshots consolidados no se reescribirán; la liga quedará marcada para revisión cuando corresponda.</p>
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setPendingFinishedUpdate(null)}>Cancelar</button><button className="danger-button" type="button" onClick={() => {
              const submitError = onUpdateLeaguePeriod(pendingFinishedUpdate, true)
              if (!submitError) { setPendingFinishedUpdate(null); setEditor(null) }
            }}>Confirmar cambio</button></div>
          </section>
        </div>
      )}

      {showIdentityManager && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="identity-manager-title">
          <button className="modal-backdrop" type="button" aria-label="Cerrar" onClick={() => setShowIdentityManager(false)} />
          <section className="swap-modal identity-manager-modal">
            <div className="modal-header"><div><p className="section-kicker">Registro estable</p><h2 id="identity-manager-title">Unificar identidades</h2></div><button className="drawer-close" type="button" onClick={() => setShowIdentityManager(false)}>×</button></div>
            <p className="modal-copy">Usa esta acción cuando dos nombres corresponden a la misma persona. Los alias seguirán resolviendo futuras cargas.</p>
            <label className="field"><span>Identidad que se reemplazará</span><select value={sourcePlayerKey} onChange={(event) => setSourcePlayerKey(event.target.value)}>{playerRegistry.map((identity) => <option key={identity.playerKey} value={identity.playerKey}>{identity.canonicalName} · {identity.aliases.join(', ')}</option>)}</select></label>
            <label className="field"><span>Identidad que se conservará</span><select value={targetPlayerKey} onChange={(event) => {
              setTargetPlayerKey(event.target.value)
              setCanonicalName(playerRegistry.find((identity) => identity.playerKey === event.target.value)?.canonicalName ?? '')
            }}>{playerRegistry.map((identity) => <option key={identity.playerKey} value={identity.playerKey}>{identity.canonicalName} · {identity.aliases.join(', ')}</option>)}</select></label>
            <label className="field"><span>Nombre canónico</span><input value={canonicalName} onChange={(event) => setCanonicalName(event.target.value)} /></label>
            {backupFeedback && <div className="form-message form-message--error">{backupFeedback}</div>}
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowIdentityManager(false)}>Cancelar</button><button className="danger-button" type="button" disabled={playerRegistry.length < 2 || sourcePlayerKey === targetPlayerKey} onClick={() => {
              if (!window.confirm('¿Unificar estas identidades? Se actualizarán resultados y movimientos asociados.')) return
              const mergeError = onMergePlayerIdentities(sourcePlayerKey, targetPlayerKey, canonicalName)
              if (mergeError) { setBackupFeedback(mergeError); return }
              setBackupFeedback(null)
              setShowIdentityManager(false)
            }}>Unificar</button></div>
          </section>
        </div>
      )}
    </section>
  )
}
