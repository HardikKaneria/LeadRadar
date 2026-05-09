import {
  calculateLeadScore,
  getDefaultScoringConfig,
  resolveScoringConfig,
  type LeadRecord,
  type LeadScoringConfig,
  type LeadStatus,
  type ProfileRecord,
  type SettingsRecord,
} from '@leadradar/shared'
import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useState } from 'react'
import {
  parseHotLeadThreshold,
  parseScoringRules,
  parseBudgetText,
  sanitizeScoringRules,
  scoringSettingsKeys,
} from '../lib/lead-ui'
import { supabase } from '../lib/supabase'
import { useAuth } from './auth-context'

interface ManualLeadInput {
  budgetText?: string | null
  description?: string | null
  platform: string
  postedAt?: string | null
  title: string
  url: string
}

interface SaveScoringConfigInput {
  hotLeadThreshold: number
  rules: { keyword: string; score: number }[]
}

interface UpdateLeadStatusResult {
  activityError: Error | null
  lead: LeadRecord
}

interface AppDataContextValue {
  addLeadNote: (leadId: string, note: string) => Promise<void>
  createManualLead: (input: ManualLeadInput) => Promise<LeadRecord>
  displayName: string
  leads: LeadRecord[]
  loading: boolean
  profile: ProfileRecord | null
  refreshLeads: () => Promise<void>
  refreshSettings: () => Promise<void>
  saveScoringConfig: (input: SaveScoringConfigInput) => Promise<void>
  scoringConfig: LeadScoringConfig
  settingsRows: SettingsRecord[]
  updateLeadStatus: (
    leadId: string,
    nextStatus: LeadStatus,
  ) => Promise<UpdateLeadStatusResult>
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

async function fetchWorkspaceProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data as ProfileRecord | null
}

async function fetchWorkspaceSettings() {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .in('key', [
      scoringSettingsKeys.hotLeadThreshold,
      scoringSettingsKeys.scoringRules,
    ])

  if (error) {
    throw error
  }

  return (data ?? []) as SettingsRecord[]
}

async function fetchWorkspaceLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as LeadRecord[]
}

function buildScoringConfig(settingsRows: SettingsRecord[]) {
  const thresholdRow = settingsRows.find(
    (row) => row.key === scoringSettingsKeys.hotLeadThreshold,
  )
  const rulesRow = settingsRows.find(
    (row) => row.key === scoringSettingsKeys.scoringRules,
  )

  return resolveScoringConfig({
    hotLeadThreshold: parseHotLeadThreshold(thresholdRow?.value),
    rules: rulesRow ? parseScoringRules(rulesRow.value) : undefined,
  })
}

async function persistSetting(
  existingRow: SettingsRecord | undefined,
  key: string,
  value: unknown,
) {
  if (existingRow) {
    const { error } = await supabase
      .from('settings')
      .update({
        updated_at: new Date().toISOString(),
        value,
      })
      .eq('id', existingRow.id)

    if (error) {
      throw error
    }

    return
  }

  const { error } = await supabase.from('settings').insert({
    key,
    value,
  })

  if (error) {
    throw error
  }
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<ProfileRecord | null>(null)
  const [settingsRows, setSettingsRows] = useState<SettingsRecord[]>([])
  const [scoringConfig, setScoringConfig] = useState(getDefaultScoringConfig())
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function bootstrap() {
      if (!user) {
        setProfile(null)
        setSettingsRows([])
        setScoringConfig(getDefaultScoringConfig())
        setLeads([])
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        const [nextProfile, nextSettingsRows, nextLeads] = await Promise.all([
          fetchWorkspaceProfile(user.id),
          fetchWorkspaceSettings(),
          fetchWorkspaceLeads(),
        ])

        if (!active) {
          return
        }

        setProfile(nextProfile)
        setSettingsRows(nextSettingsRows)
        setScoringConfig(buildScoringConfig(nextSettingsRows))
        setLeads(nextLeads)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      active = false
    }
  }, [user])

  async function refreshLeads() {
    const nextLeads = await fetchWorkspaceLeads()
    setLeads(nextLeads)
  }

  async function refreshSettings() {
    const nextSettingsRows = await fetchWorkspaceSettings()
    setSettingsRows(nextSettingsRows)
    setScoringConfig(buildScoringConfig(nextSettingsRows))
  }

  async function createManualLead(input: ManualLeadInput) {
    if (!user) {
      throw new Error('You must be signed in to add a lead.')
    }

    const budget = parseBudgetText(input.budgetText)
    const scoreResult = calculateLeadScore(
      {
        budgetText: input.budgetText,
        description: input.description,
        platform: input.platform,
        title: input.title,
      },
      scoringConfig,
    )

    const { data, error } = await supabase
      .from('leads')
      .insert({
        budget_max: budget.budgetMax,
        budget_min: budget.budgetMin,
        budget_text: input.budgetText ?? null,
        created_by: user.id,
        currency: budget.currency,
        description: input.description ?? null,
        matched_keywords: scoreResult.matchedKeywords,
        platform: input.platform,
        posted_at: input.postedAt ?? null,
        raw_payload: {
          captured_at: new Date().toISOString(),
          source: 'manual',
        },
        score: scoreResult.score,
        score_reason: scoreResult.reason,
        status: 'new',
        title: input.title,
        url: input.url,
      })
      .select('*')
      .single()

    if (error) {
      throw error
    }

    const nextLead = data as LeadRecord
    setLeads((current) => [nextLead, ...current])

    const { error: activityError } = await supabase.from('lead_activity').insert({
      action: 'lead_created',
      lead_id: nextLead.id,
      new_value: 'new',
      user_id: user.id,
    })

    if (activityError) {
      console.error(activityError)
    }

    return nextLead
  }

  async function updateLeadStatus(leadId: string, nextStatus: LeadStatus) {
    if (!user) {
      throw new Error('You must be signed in to update a lead.')
    }

    const existingLead = leads.find((lead) => lead.id === leadId)

    const { data, error } = await supabase
      .from('leads')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    const nextLead = data as LeadRecord
    setLeads((current) =>
      current.map((lead) => (lead.id === leadId ? nextLead : lead)),
    )

    const { error: activityInsertError } = await supabase
      .from('lead_activity')
      .insert({
        action: 'status_changed',
        lead_id: leadId,
        new_value: nextStatus,
        old_value: existingLead?.status ?? null,
        user_id: user.id,
      })

    return {
      activityError: activityInsertError,
      lead: nextLead,
    }
  }

  async function addLeadNote(leadId: string, note: string) {
    if (!user) {
      throw new Error('You must be signed in to add a note.')
    }

    const { error } = await supabase.from('lead_notes').insert({
      lead_id: leadId,
      note,
      user_id: user.id,
    })

    if (error) {
      throw error
    }

    await supabase.from('lead_activity').insert({
      action: 'note_added',
      lead_id: leadId,
      new_value: note.slice(0, 140),
      user_id: user.id,
    })
  }

  async function saveScoringConfig(input: SaveScoringConfigInput) {
    const cleanedRules = sanitizeScoringRules(input.rules)

    await persistSetting(
      settingsRows.find((row) => row.key === scoringSettingsKeys.hotLeadThreshold),
      scoringSettingsKeys.hotLeadThreshold,
      input.hotLeadThreshold,
    )
    await persistSetting(
      settingsRows.find((row) => row.key === scoringSettingsKeys.scoringRules),
      scoringSettingsKeys.scoringRules,
      cleanedRules,
    )

    await refreshSettings()
  }

  return (
    <AppDataContext.Provider
      value={{
        addLeadNote,
        createManualLead,
        displayName:
          profile?.full_name ?? user?.user_metadata.full_name ?? user?.email ?? 'Team member',
        leads,
        loading,
        profile,
        refreshLeads,
        refreshSettings,
        saveScoringConfig,
        scoringConfig,
        settingsRows,
        updateLeadStatus,
      }}
    >
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData() {
  const context = useContext(AppDataContext)

  if (!context) {
    throw new Error('useAppData must be used inside AppDataProvider')
  }

  return context
}
