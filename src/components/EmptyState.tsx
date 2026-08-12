'use client'

/**
 * What a screen shows when it has nothing yet.
 *
 * "ยังไม่มีรายการ" tells staff what they can already see. An empty screen is
 * the one moment the interface has their full attention, so it says what this
 * screen is for and what to do next instead.
 *
 * `action` is optional: use it only where the next step lives on this screen.
 * Pointing at something the staff cannot reach from here is worse than
 * saying nothing.
 */
export default function EmptyState({
  title,
  hint,
  action,
  compact = false,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
  compact?: boolean
}) {
  return (
    <div className={`empty${compact ? ' empty-compact' : ''}`}>
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}
