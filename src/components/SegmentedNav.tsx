import { GridIcon, SettingsIcon, TrophyIcon } from './icons'

export type AppView = 'tables' | 'standing' | 'settings'

interface SegmentedNavProps {
  activeView: AppView
  onChange: (view: AppView) => void
}

const items = [
  { id: 'tables' as const, label: 'Mesas', icon: GridIcon },
  { id: 'standing' as const, label: 'Standing', icon: TrophyIcon },
  { id: 'settings' as const, label: 'Configuración', icon: SettingsIcon },
]

export function SegmentedNav({ activeView, onChange }: SegmentedNavProps) {
  return (
    <nav className="segmented-nav" aria-label="Secciones del torneo">
      {items.map((item) => {
        const Icon = item.icon
        const isActive = activeView === item.id

        return (
          <button
            className={isActive ? 'segmented-nav__item is-active' : 'segmented-nav__item'}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(item.id)}
            key={item.id}
          >
            <Icon />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
