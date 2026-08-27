import { useState } from 'react'
import type { GlobalSection } from '../domain/workspace'

interface GlobalNavigationProps {
  activeSection: GlobalSection
  storageStatus: 'saving' | 'saved' | 'error'
  onNavigate: (section: GlobalSection) => void
}

const items: { id: GlobalSection; label: string }[] = [
  { id: 'home', label: 'Inicio' },
  { id: 'leagues', label: 'Ligas' },
  { id: 'events', label: 'Eventos' },
  { id: 'hall_of_fame', label: 'Hall of Fame' },
  { id: 'settings', label: 'Configuración' },
]

const storageLabels = {
  saving: 'Guardando…',
  saved: 'Guardado local',
  error: 'Error al guardar',
}

export function GlobalNavigation({
  activeSection,
  storageStatus,
  onNavigate,
}: GlobalNavigationProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const navigate = (section: GlobalSection) => {
    onNavigate(section)
    setMenuOpen(false)
  }

  return (
    <header className="global-header">
      <div className="global-header__inner">
        <button className="global-brand" type="button" onClick={() => navigate('home')}>
          <span className="brand__mark" aria-hidden="true">A<span>52</span></span>
          <span>
            <small>ÁREA 52</small>
            <strong>Commander Manager</strong>
          </span>
        </button>

        <button
          className="global-menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="global-navigation"
          onClick={() => setMenuOpen((current) => !current)}
        >
          Menú
        </button>

        <nav
          id="global-navigation"
          className={menuOpen ? 'global-navigation is-open' : 'global-navigation'}
          aria-label="Navegación principal"
        >
          {items.map((item) => (
            <button
              key={item.id}
              className={activeSection === item.id ? 'is-active' : ''}
              type="button"
              aria-current={activeSection === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <span className={`global-storage global-storage--${storageStatus}`}>
          <span /> {storageLabels[storageStatus]}
        </span>
      </div>
    </header>
  )
}
