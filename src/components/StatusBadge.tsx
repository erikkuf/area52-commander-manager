import type { TableStatus } from '../domain/tournament'
import { CheckIcon } from './icons'

interface StatusBadgeProps {
  status: TableStatus
}

const statusLabels: Record<TableStatus, string> = {
  pending: 'Pendiente',
  saved: 'Guardada',
  edited: 'Editada',
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      {status === 'saved' ? <CheckIcon /> : <span className="status-badge__dot" />}
      {statusLabels[status]}
    </span>
  )
}
