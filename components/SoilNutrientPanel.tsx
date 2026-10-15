'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'

type Status = {
  client_id: string
  soil_nutrient_module_enabled: boolean
  has_soil_testing_lab: boolean
}

type Props = {
  clientId: string
  isCoaching?: boolean
  isTraining?: boolean
}

export default function SoilNutrientPanel({ clientId, isCoaching, isTraining }: Props) {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { load() }, [clientId])

  async function load() {
    try {
      setLoading(true)
      const { data } = await api.get(`/sa/clients/${clientId}/soil-nutrient-status`)
      setStatus(data)
    } finally {
      setLoading(false)
    }
  }

  async function toggleModule() {
    if (!status) return
    setToggling('module'); setError(null)
    try {
      const { data } = await api.patch(
        `/sa/clients/${clientId}/soil-nutrient-enabled`,
        { enabled: !status.soil_nutrient_module_enabled },
      )
      setStatus(data)
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string | { message?: string } } } })
        ?.response?.data?.detail
      const msg = typeof detail === 'string'
        ? detail
        : detail?.message || 'Toggle failed'
      setError(msg)
    } finally {
      setToggling(null)
    }
  }

  async function toggleLab() {
    if (!status) return
    setToggling('lab'); setError(null)
    try {
      const { data } = await api.patch(
        `/sa/clients/${clientId}/soil-testing-lab`,
        { enabled: !status.has_soil_testing_lab },
      )
      setStatus(data)
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string | { message?: string } } } })
        ?.response?.data?.detail
      const msg = typeof detail === 'string'
        ? detail
        : detail?.message || 'Toggle failed'
      setError(msg)
    } finally {
      setToggling(null)
    }
  }

  const sandboxClient = isCoaching || isTraining
  const sandboxReason = isCoaching
    ? 'Coaching sandbox clients cannot enable the Soil Nutrient Module or the lab.'
    : isTraining
      ? 'Training sandbox clients cannot enable the Soil Nutrient Module.'
      : null

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
        Soil Nutrient Management
      </p>

      {loading ? (
        <p className="text-xs text-slate-400 italic">Loading…</p>
      ) : !status ? (
        <p className="text-xs text-red-500">Failed to load status.</p>
      ) : (
        <div className="space-y-3">
          {/* Module toggle */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">Soil Nutrient Module</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Unlocks Portal → Products, Portal → Normal Ranges, and Package → Override Normal Range tabs for CA/SE/CM.
              </p>
            </div>
            <button
              onClick={toggleModule}
              disabled={toggling !== null || (sandboxClient && !status.soil_nutrient_module_enabled)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                status.soil_nutrient_module_enabled
                  ? 'border-red-200 text-red-500 hover:bg-red-50'
                  : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
              }`}
            >
              {toggling === 'module' ? '…' : status.soil_nutrient_module_enabled ? 'Disable' : 'Enable'}
            </button>
          </div>

          {/* Lab toggle */}
          <div className="flex items-start justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">Soil Testing Lab</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Unlocks the LAB_TECHNICIAN role and lab-portal screens for this Client&apos;s own farmer-subscription data entry (Decision K).
              </p>
            </div>
            <button
              onClick={toggleLab}
              disabled={toggling !== null || (isCoaching && !status.has_soil_testing_lab)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                status.has_soil_testing_lab
                  ? 'border-red-200 text-red-500 hover:bg-red-50'
                  : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
              }`}
            >
              {toggling === 'lab' ? '…' : status.has_soil_testing_lab ? 'Disable' : 'Enable'}
            </button>
          </div>

          {/* Current state summary */}
          <div className="flex items-center gap-2 pt-2">
            <StatusPill on={status.soil_nutrient_module_enabled} label="Module" />
            <StatusPill on={status.has_soil_testing_lab} label="Lab" />
          </div>

          {sandboxReason && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              {sandboxReason}
            </p>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function StatusPill({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${
      on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {label}: {on ? 'on' : 'off'}
    </span>
  )
}
