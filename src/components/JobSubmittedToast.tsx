import { useEffect, useRef } from 'react'
import { CheckCircle2, X } from 'lucide-react'

type JobSubmittedToastProps = {
  open: boolean
  onClose: () => void
  message?: string
}

/**
 * Fixed success banner shown after creating a job (e.g. from /dashboard/new-task).
 */
export default function JobSubmittedToast({ open, onClose, message = 'Job submitted successfully.' }: JobSubmittedToastProps) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => onCloseRef.current(), 4500)
    return () => window.clearTimeout(id)
  }, [open])

  if (!open) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[100] flex w-[min(100%-2rem,24rem)] -translate-x-1/2"
    >
      <div className="flex w-full items-start gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3.5 text-slate-900 shadow-lg shadow-slate-900/10">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-sm font-semibold text-slate-950">Success</div>
          <p className="mt-0.5 text-sm text-slate-600 leading-snug">{message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
