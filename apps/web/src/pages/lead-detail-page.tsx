import type { LeadActivityRecord, LeadNoteRecord, LeadRecord, ProfileRecord } from '@leadradar/shared'
import { ArrowLeftOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Result,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LEAD_STATUSES, type LeadStatus } from '@leadradar/shared'
import { useAppData } from '../contexts/app-data-context'
import {
  formatBudget,
  formatDateTime,
  formatLeadStatus,
  getScoreTagColor,
} from '../lib/lead-ui'
import { supabase } from '../lib/supabase'

export function LeadDetailPage() {
  const { leadId } = useParams()
  const { addLeadNote, leads, loading, scoringConfig, updateLeadStatus } = useAppData()
  const [fallbackLead, setFallbackLead] = useState<LeadRecord | null>(null)
  const [notes, setNotes] = useState<LeadNoteRecord[]>([])
  const [activity, setActivity] = useState<LeadActivityRecord[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRecord>>({})
  const [draftStatuses, setDraftStatuses] = useState<Record<string, LeadStatus>>({})
  const [statusSaving, setStatusSaving] = useState(false)
  const [note, setNote] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const currentLeadId = leadId ?? ''
  const lead = leads.find((item) => item.id === leadId) ?? fallbackLead
  const selectedStatus = draftStatuses[currentLeadId] ?? lead?.status

  useEffect(() => {
    if (!leadId || loading || lead) {
      return
    }

    async function fetchLead() {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .maybeSingle()

      if (error) {
        message.error(error.message)
        return
      }

      setFallbackLead((data as LeadRecord | null) ?? null)
    }

    void fetchLead()
  }, [lead, leadId, loading])

  useEffect(() => {
    if (!leadId) {
      return
    }

    async function fetchThread() {
      const [{ data: nextNotes, error: notesError }, { data: nextActivity, error: activityError }] =
        await Promise.all([
          supabase
            .from('lead_notes')
            .select('*')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false }),
          supabase
            .from('lead_activity')
            .select('*')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false }),
        ])

      if (notesError) {
        message.error(notesError.message)
        return
      }

      if (activityError) {
        message.error(activityError.message)
        return
      }

      const resolvedNotes = (nextNotes ?? []) as LeadNoteRecord[]
      const resolvedActivity = (nextActivity ?? []) as LeadActivityRecord[]
      setNotes(resolvedNotes)
      setActivity(resolvedActivity)

      const userIds = Array.from(
        new Set(
          [...resolvedNotes, ...resolvedActivity]
            .map((item) => item.user_id)
            .filter((value): value is string => Boolean(value)),
        ),
      )

      if (userIds.length === 0) {
        setProfilesById({})
        return
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds)

      if (profilesError) {
        message.error(profilesError.message)
        return
      }

      const nextProfilesById = (profiles ?? []).reduce<Record<string, ProfileRecord>>(
        (accumulator, profile) => {
          const typedProfile = profile as ProfileRecord
          accumulator[typedProfile.id] = typedProfile
          return accumulator
        },
        {},
      )

      setProfilesById(nextProfilesById)
    }

    void fetchThread()
  }, [leadId])

  async function reloadThread() {
    if (!leadId) {
      return
    }

    const [{ data: nextNotes }, { data: nextActivity }] = await Promise.all([
      supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }),
      supabase
        .from('lead_activity')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }),
    ])

    setNotes((nextNotes ?? []) as LeadNoteRecord[])
    setActivity((nextActivity ?? []) as LeadActivityRecord[])
  }

  async function handleStatusUpdate() {
    if (!leadId || !selectedStatus || !lead) {
      return
    }

    setStatusSaving(true)

    try {
      const result = await updateLeadStatus(leadId, selectedStatus)
      setDraftStatuses((current) => {
        const nextDrafts = { ...current }
        delete nextDrafts[currentLeadId]
        return nextDrafts
      })
      if (result.activityError) {
        message.warning('Status updated, but activity logging could not be saved.')
      } else {
        message.success('Lead status updated.')
      }
      await reloadThread()
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to update status.')
    } finally {
      setStatusSaving(false)
    }
  }

  async function handleAddNote() {
    if (!leadId || note.trim().length === 0) {
      return
    }

    setNoteSaving(true)

    try {
      await addLeadNote(leadId, note.trim())
      setNote('')
      message.success('Internal note added.')
      await reloadThread()
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to save the note.')
    } finally {
      setNoteSaving(false)
    }
  }

  function resolveAuthorName(userId?: string | null) {
    if (!userId) {
      return 'Unknown teammate'
    }

    return profilesById[userId]?.full_name ?? 'Hkrafted teammate'
  }

  if (!leadId) {
    return (
      <Result
        extra={<Link to="/leads">Return to leads</Link>}
        status="404"
        title="Lead not found"
      />
    )
  }

  if (!loading && !lead) {
    return (
      <Result
        extra={<Link to="/leads">Return to leads</Link>}
        status="404"
        title="Lead not found"
      />
    )
  }

  if (!lead) {
    return null
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <Space size="small">
            <Link to="/leads">
              <Button icon={<ArrowLeftOutlined />} type="text">
                Back to leads
              </Button>
            </Link>
          </Space>
          <h2 style={{ marginTop: 8 }}>{lead.title}</h2>
          <p>{lead.description ?? 'No description captured for this lead yet.'}</p>
        </div>
        <Space wrap>
          <Tag>{lead.platform}</Tag>
          <Tag color={getScoreTagColor(lead.score, scoringConfig.hotLeadThreshold)}>
            Score {lead.score}
          </Tag>
          <Tag>{formatLeadStatus(lead.status)}</Tag>
        </Space>
      </div>

      <div className="detail-grid">
        <Space direction="vertical" size="large" style={{ display: 'flex' }}>
          <Card className="surface-card" title="Lead Overview">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="URL">
                <a href={lead.url} rel="noreferrer" target="_blank">
                  {lead.url}
                </a>
              </Descriptions.Item>
              <Descriptions.Item label="Budget">
                {formatBudget(
                  lead.budget_min,
                  lead.budget_max,
                  lead.currency,
                  lead.budget_text,
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Created">
                {formatDateTime(lead.created_at)}
              </Descriptions.Item>
              <Descriptions.Item label="Posted">
                {formatDateTime(lead.posted_at)}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {lead.description && (
            <Card className="surface-card" title="Project Description">
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
                {lead.description}
              </Typography.Paragraph>
            </Card>
          )}

          <Card className="surface-card" title="Match Analysis">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Score reason">
                {lead.score_reason ?? 'Not available'}
              </Descriptions.Item>
              <Descriptions.Item label="Matched keywords">
                <Space wrap>
                  {lead.matched_keywords && lead.matched_keywords.length > 0 ? (
                    lead.matched_keywords.map((keyword) => (
                      <Tag key={keyword}>{keyword}</Tag>
                    ))
                  ) : (
                    <Typography.Text type="secondary">No keyword matches saved.</Typography.Text>
                  )}
                </Space>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card className="surface-card" title="Quick Actions">
            <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
              <Typography.Text type="secondary">Change lead status:</Typography.Text>
              <Space wrap>
                {LEAD_STATUSES.map((status) => (
                  <Button
                    key={status}
                    type={selectedStatus === status ? 'primary' : 'default'}
                    onClick={() =>
                      setDraftStatuses((current) => ({
                        ...current,
                        [currentLeadId]: status,
                      }))
                    }
                  >
                    {formatLeadStatus(status)}
                  </Button>
                ))}
              </Space>
              {selectedStatus && selectedStatus !== lead.status && (
                <Button
                  loading={statusSaving}
                  type="primary"
                  onClick={() => void handleStatusUpdate()}
                >
                  Save status change
                </Button>
              )}
            </Space>
          </Card>
        </Space>

        <Space direction="vertical" size="large" style={{ display: 'flex' }}>
          <Card className="surface-card" title="Internal Notes">
            <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
              <Input.TextArea
                autoSize={{ minRows: 4, maxRows: 6 }}
                placeholder="Add internal notes, proposal angle, client fit, or follow-up details..."
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <Button
                loading={noteSaving}
                type="primary"
                onClick={() => void handleAddNote()}
              >
                Add note
              </Button>
              <div className="note-list">
                {notes.length > 0 ? (
                  notes.map((noteItem) => (
                    <div key={noteItem.id} className="note-item">
                      <div className="note-item-header">
                        <strong>{resolveAuthorName(noteItem.user_id)}</strong>
                        <span>{formatDateTime(noteItem.created_at)}</span>
                      </div>
                      <Typography.Paragraph style={{ marginBottom: 0 }}>
                        {noteItem.note}
                      </Typography.Paragraph>
                    </div>
                  ))
                ) : (
                  <Empty description="No notes added yet." />
                )}
              </div>
            </Space>
          </Card>

          <Card className="surface-card" title="Status Timeline / Activity">
            <div className="activity-list">
              {activity.length > 0 ? (
                activity.map((item) => (
                  <div key={item.id} className="activity-item">
                    <div className="activity-item-header">
                      <strong>{resolveAuthorName(item.user_id)}</strong>
                      <span>{formatDateTime(item.created_at)}</span>
                    </div>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      {item.action === 'status_changed'
                        ? `Changed status from ${item.old_value ?? 'unknown'} to ${item.new_value ?? 'unknown'}.`
                        : item.action === 'lead_created'
                          ? 'Created this lead manually.'
                          : item.action === 'note_added'
                            ? 'Added an internal note.'
                            : item.action}
                    </Typography.Paragraph>
                  </div>
                ))
              ) : (
                <Empty description="No activity recorded yet." />
              )}
            </div>
          </Card>
        </Space>
      </div>
    </div>
  )
}
