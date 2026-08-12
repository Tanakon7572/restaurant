'use client'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  isDanger?: boolean
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  onConfirm,
  onCancel,
  isDanger = false,
}: ConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'oklch(0 0 0 / 0.55)',
        backdropFilter: 'blur(4px)',
        animation: 'overlayIn 0.18s ease-out both',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      onClick={onCancel}
    >
      <div
        className="glass-panel"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '600px',
          padding: '28px 24px 24px',
          borderBottom: 'none',
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          animation: 'dialogIn 0.22s ease-out both',
        }}
      >
        <h3
          style={{
            fontSize: '1.15rem',
            fontWeight: 700,
            marginBottom: '8px',
            color: isDanger ? 'var(--c-danger)' : 'var(--c-text)',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            color: 'var(--c-text-2)',
            fontSize: '0.9rem',
            lineHeight: 1.55,
            marginBottom: '24px',
          }}
        >
          {message}
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-ghost" onClick={onCancel} style={{ flex: 1 }}>
            {cancelText}
          </button>
          <button
            /* Solid berry, not the outline `btn-danger`: in here the
               destructive action is the one committed action, so it should
               carry the weight of a primary. */
            className={`btn ${isDanger ? 'btn-danger-solid' : 'btn-primary'}`}
            onClick={() => { onConfirm(); onCancel() }}
            style={{ flex: 1 }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
