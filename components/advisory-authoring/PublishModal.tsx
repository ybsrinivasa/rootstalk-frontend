'use client'

// Batch 39P-d (2026-05-16) — shared Publish confirmation modal for
// the UCAT publish lifecycle. Mounted by CCA Global Package + CHA-PG
// Global, and by every future pipe whose authoring publishes through
// the same structured 422 contract.
//
// Content gates fire on the backend (`assert_global_*_publish_ready`)
// and surface as `publish_blocked` 422 with a `missing[]` list. The
// modal renders that list verbatim so the CM sees the complete
// checklist on a single round-trip — fix-one-at-a-time is explicitly
// avoided per spec.

interface PublishBlocker {
  code: string
  message: string
}

interface ContentSnapshot {
  timelines: number
  practices: number
  relations: number
  cqs: number
}

interface Props {
  entityLabel: string             // "Package" | "PG Recommendation" | …
  currentVersion: number
  /** True on the first publish ever. False on subsequent
   *  publishes — the modal then renders "v_N → v_{N+1}". */
  isFirstPublish: boolean
  contentSnapshot: ContentSnapshot
  blockers: PublishBlocker[]
  /** Free-form error string (network / non-structured failure).
   *  Suppressed when blockers are present — the structured list is
   *  more useful. */
  error: string
  publishing: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function PublishModal({
  entityLabel, currentVersion, isFirstPublish, contentSnapshot,
  blockers, error, publishing, onConfirm, onCancel,
}: Props) {
  const nextVersion = isFirstPublish ? currentVersion : currentVersion + 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Publish {entityLabel}</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Once published, the {entityLabel.toLowerCase()} becomes available
            to the clients (or, for PG, to the SE library for import).
          </p>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Version</p>
            <p className="text-sm font-medium text-slate-800 mt-1">
              {isFirstPublish ? (
                <>First publish — will become <span className="font-bold">v{nextVersion}</span></>
              ) : (
                <>v{currentVersion} → <span className="font-bold">v{nextVersion}</span></>
              )}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Content snapshot</p>
            <ul className="text-sm text-slate-700 space-y-1">
              <li>{contentSnapshot.timelines} active Timeline{contentSnapshot.timelines === 1 ? '' : 's'}</li>
              <li>{contentSnapshot.practices} Practice{contentSnapshot.practices === 1 ? '' : 's'}</li>
              <li>{contentSnapshot.relations} Relation{contentSnapshot.relations === 1 ? '' : 's'}</li>
              <li>{contentSnapshot.cqs} Conditional Question{contentSnapshot.cqs === 1 ? '' : 's'}</li>
            </ul>
          </div>
          {blockers.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-[11px] uppercase tracking-wider text-red-700 font-semibold mb-2">Blocking issues</p>
              <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
                {blockers.map(b => (
                  <li key={b.code + b.message}>{b.message}</li>
                ))}
              </ul>
            </div>
          )}
          {error && blockers.length === 0 && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button type="button" onClick={onCancel}
            className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={publishing}
            className="flex-1 bg-blue-600 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
            {publishing ? 'Publishing…' : `Publish v${nextVersion}`}
          </button>
        </div>
      </div>
    </div>
  )
}
