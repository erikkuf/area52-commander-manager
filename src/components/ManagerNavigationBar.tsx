interface ManagerNavigationBarProps {
  contextLabel: string
  onExit: () => void
}

export function ManagerNavigationBar({ contextLabel, onExit }: ManagerNavigationBarProps) {
  return (
    <div className="manager-navigation-bar">
      <div>
        <button type="button" onClick={onExit}>← Volver al inicio</button>
        <span>{contextLabel}</span>
      </div>
    </div>
  )
}
