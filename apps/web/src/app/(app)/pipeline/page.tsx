import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BulbOutlined,
  CalendarOutlined,
  CheckOutlined,
  MessageOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  List,
  Modal,
  Result,
  Select,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Timeline,
  Typography,
  theme,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type {
  AssistantMeetingPrep,
  AssistantNextAction,
  LeadDetail,
  LeadSetStage,
  LeadStage,
  LeadSummary,
  OutreachChannel,
  OutreachMessage,
  Priority,
  ProposalSummary,
  TaskDetail,
} from '@radar/contracts';
import { LEAD_SET_STAGES, OUTREACH_CHANNELS, PRIORITIES } from '@radar/contracts';
import { closeLead, getLead, listLeads, setLeadStage } from '@/lib/leads';
import { completeTask, createTask, listLeadTasks, rescheduleTask } from '@/lib/tasks';
import { listMessages } from '@/lib/outreach';
import { listProposals } from '@/lib/proposals';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { LeadStageTag, PriorityTag, ScoreTag, TaskStatusTag } from '@/components/ui/status-tag';

dayjs.extend(relativeTime);

const { Text, Paragraph } = Typography;

// Pipeline columns, active stages first. Terminal won/lost sit at the end as closed lanes.
const BOARD_STAGES: LeadStage[] = [
  'new',
  'contacted',
  'reply_received',
  'meeting_scheduled',
  'proposal_sent',
  'negotiation',
  'on_hold',
  'won',
  'lost',
];

const STAGE_LABEL: Record<LeadStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  reply_received: 'Reply received',
  meeting_scheduled: 'Meeting scheduled',
  proposal_sent: 'Proposal sent',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
  on_hold: 'On hold',
};

function isActiveStage(stage: LeadStage): boolean {
  return stage !== 'won' && stage !== 'lost';
}

function formatDateTime(value: string): string {
  return dayjs(value).format('MMM D, YYYY · h:mm A');
}

function formatValue(value: number | null): string {
  return value == null ? 'Unestimated' : value.toLocaleString();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

export default function PipelinePage() {
  const { currentOrg, can, accessToken } = useAuth();
  const { token } = theme.useToken();

  const organizationId = currentOrg?.organizationId ?? null;
  const canRead = can('leads.read') || can('leads.read_own');
  const canWrite = can('leads.write') || can('leads.write_own');
  const canTasks = can('tasks.manage') || can('tasks.manage_own');
  const canAi = can('ai.use');

  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!organizationId || !canRead) {
      setLeads([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listLeads(organizationId, { page: 1, pageSize: 100, sort: 'updated' })
      .then((result) => {
        if (!cancelled) setLeads(result.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLeads([]);
          setError(getErrorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, canRead, reloadToken]);

  const grouped = useMemo(() => {
    const map = new Map<LeadStage, LeadSummary[]>();
    for (const stage of BOARD_STAGES) map.set(stage, []);
    for (const lead of leads) map.get(lead.stage)?.push(lead);
    return map;
  }, [leads]);

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);

  if (!currentOrg) {
    return (
      <Result
        status="info"
        title="No workspace yet"
        subTitle="Join or create a workspace before working the pipeline."
      />
    );
  }

  if (!canRead) {
    return (
      <Result
        status="403"
        title="No access"
        subTitle="Your current role does not include leads.read."
      />
    );
  }

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Lead pipeline"
        title="Pipeline"
        subtitle="Every promoted lead by stage. Open a lead to work its follow-ups — an active lead always keeps an open task."
        extra={
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
            Refresh
          </Button>
        }
      />

      {error ? (
        <Alert type="error" showIcon message={error} />
      ) : loading && leads.length === 0 ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : leads.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No leads yet. Promote a qualified opportunity to start the pipeline."
        />
      ) : (
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
          {BOARD_STAGES.map((stage) => {
            const column = grouped.get(stage) ?? [];
            return (
              <Card
                key={stage}
                size="small"
                style={{ minWidth: 280, maxWidth: 280, flex: '0 0 auto', opacity: isActiveStage(stage) ? 1 : 0.78 }}
                title={
                  <Flex align="center" justify="space-between">
                    <span>{STAGE_LABEL[stage]}</span>
                    <Tag style={{ marginInlineEnd: 0 }}>{column.length}</Tag>
                  </Flex>
                }
              >
                {column.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    No leads
                  </Text>
                ) : (
                  <Flex vertical gap={8}>
                    {column.map((lead) => (
                      <div
                        key={lead.id}
                        onClick={() => setActiveLeadId(lead.id)}
                        style={{
                          padding: 12,
                          borderRadius: token.borderRadiusLG,
                          cursor: 'pointer',
                          border: `1px solid ${token.colorBorderSecondary}`,
                          background: token.colorBgContainer,
                        }}
                      >
                        <Text strong ellipsis style={{ display: 'block', marginBottom: 8 }}>
                          {lead.title}
                        </Text>
                        <Space size={[6, 6]} wrap>
                          <PriorityTag priority={lead.priority} />
                          <ScoreTag score={lead.score} />
                        </Space>
                        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
                          Value {formatValue(lead.value)} · {dayjs(lead.updatedAt).fromNow()}
                        </Text>
                      </div>
                    ))}
                  </Flex>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <LeadWorkspace
        organizationId={organizationId}
        leadId={activeLeadId}
        accessToken={accessToken}
        canWrite={canWrite}
        canTasks={canTasks}
        canAi={canAi}
        onClose={() => setActiveLeadId(null)}
        onChanged={refresh}
      />
    </Flex>
  );
}

// ── Lead workspace drawer ─────────────────────────────────────────────────────────────────────

interface WorkspaceProps {
  organizationId: string | null;
  leadId: string | null;
  accessToken: string | null;
  canWrite: boolean;
  canTasks: boolean;
  canAi: boolean;
  onClose: () => void;
  onChanged: () => void;
}

function LeadWorkspace({ organizationId, leadId, accessToken, canWrite, canTasks, canAi, onClose, onChanged }: WorkspaceProps) {
  const { message } = App.useApp();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [tasks, setTasks] = useState<TaskDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [busy, setBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<TaskDetail | null>(null);
  const [closeOutcome, setCloseOutcome] = useState<'won' | 'lost' | null>(null);

  const open = leadId != null;

  const reloadLocal = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    if (!organizationId || !leadId) {
      setLead(null);
      setTasks([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([getLead(organizationId, leadId), listLeadTasks(organizationId, leadId)])
      .then(([detail, leadTasks]) => {
        if (cancelled) return;
        setLead(detail);
        setTasks(leadTasks);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLead(null);
        setTasks([]);
        setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, leadId, reloadToken]);

  const openTaskCount = useMemo(() => tasks.filter((task) => task.status === 'open').length, [tasks]);

  function afterMutation() {
    reloadLocal();
    onChanged();
  }

  async function moveStage(stage: LeadSetStage) {
    if (!organizationId || !lead) return;
    setBusy(true);
    try {
      await setLeadStage(organizationId, [lead.id], stage);
      message.success(`Moved to ${STAGE_LABEL[stage]}`);
      afterMutation();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reschedule(task: TaskDetail, dueAt: Dayjs) {
    if (!organizationId) return;
    try {
      await rescheduleTask(organizationId, { taskId: task.id, dueAt: dueAt.toISOString() });
      message.success('Task rescheduled');
      afterMutation();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  }

  // Whether completing/cancelling this task would break the "active lead always has an open task"
  // invariant — used to make the follow-up mandatory in the modal (matching the RPC guard).
  function isLastOpenOnActiveLead(task: TaskDetail): boolean {
    return Boolean(lead) && isActiveStage(lead!.stage) && task.status === 'open' && openTaskCount <= 1;
  }

  return (
    <Drawer
      width={560}
      open={open}
      onClose={onClose}
      title={lead ? lead.title : 'Lead'}
      destroyOnClose
    >
      {error ? (
        <Alert type="error" showIcon message={error} />
      ) : loading && !lead ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !lead ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Lead not found." />
      ) : (
        <Flex vertical gap={20}>
          {/* ── Lead header ── */}
          <Space size={[6, 6]} wrap>
            <LeadStageTag stage={lead.stage} />
            <PriorityTag priority={lead.priority} />
            <ScoreTag score={lead.score} />
          </Space>

          {lead.description ? (
            <Paragraph type="secondary" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {lead.description}
            </Paragraph>
          ) : null}

          <Descriptions
            size="small"
            column={1}
            bordered
            items={[
              { key: 'value', label: 'Value', children: formatValue(lead.value) },
              { key: 'source', label: 'Source', children: lead.source ?? '—' },
              { key: 'created', label: 'Created', children: formatDateTime(lead.createdAt) },
              ...(lead.closedAt
                ? [{ key: 'closed', label: 'Closed', children: formatDateTime(lead.closedAt) }]
                : []),
              ...(lead.closeReason
                ? [{ key: 'reason', label: 'Close reason', children: lead.closeReason }]
                : []),
            ]}
          />

          {canWrite ? (
            <Card size="small" title="Stage">
              <Flex vertical gap={12}>
                <Select<LeadSetStage>
                  value={isActiveStage(lead.stage) ? (lead.stage as LeadSetStage) : undefined}
                  placeholder="Move to stage"
                  disabled={busy}
                  onChange={(value) => void moveStage(value)}
                  options={LEAD_SET_STAGES.map((stage) => ({ value: stage, label: STAGE_LABEL[stage] }))}
                />
                {isActiveStage(lead.stage) ? (
                  <Space>
                    <Button onClick={() => setCloseOutcome('won')}>Close won</Button>
                    <Button danger onClick={() => setCloseOutcome('lost')}>
                      Close lost
                    </Button>
                  </Space>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    This lead is closed. Reopen by moving it to an active stage above.
                  </Text>
                )}
              </Flex>
            </Card>
          ) : null}

          {/* ── Tabbed panels ── */}
          <Tabs
            size="small"
            items={[
              {
                key: 'tasks',
                label: 'Tasks',
                children: (
                  <TasksPanel
                    lead={lead}
                    tasks={tasks}
                    canTasks={canTasks}
                    openTaskCount={openTaskCount}
                    onAdd={() => setAddOpen(true)}
                    onComplete={(task) => setCompleteTarget(task)}
                    onReschedule={reschedule}
                  />
                ),
              },
              {
                key: 'outreach',
                label: 'Outreach & AI',
                children: organizationId ? (
                  <OutreachPanel
                    organizationId={organizationId}
                    leadId={lead.id}
                    accessToken={accessToken}
                    canWrite={canWrite}
                    canAi={canAi}
                  />
                ) : null,
              },
              {
                key: 'proposals',
                label: 'Proposals',
                children: organizationId ? (
                  <ProposalsPanel
                    organizationId={organizationId}
                    leadId={lead.id}
                    accessToken={accessToken}
                    canAi={canAi}
                  />
                ) : null,
              },
            ]}
          />
        </Flex>
      )}

      {lead ? (
        <>
          <AddTaskModal
            open={addOpen}
            organizationId={organizationId}
            leadId={lead.id}
            onClose={() => setAddOpen(false)}
            onDone={() => {
              setAddOpen(false);
              afterMutation();
            }}
          />
          <CompleteTaskModal
            task={completeTarget}
            requireFollowUp={completeTarget ? isLastOpenOnActiveLead(completeTarget) : false}
            onClose={() => setCompleteTarget(null)}
            onDone={() => {
              setCompleteTarget(null);
              afterMutation();
            }}
          />
          <CloseLeadModal
            outcome={closeOutcome}
            leadId={lead.id}
            onClose={() => setCloseOutcome(null)}
            onDone={() => {
              setCloseOutcome(null);
              afterMutation();
            }}
          />
        </>
      ) : null}
    </Drawer>
  );
}

// ── Tasks panel ──────────────────────────────────────────────────────────────────────────────

interface TasksPanelProps {
  lead: LeadDetail;
  tasks: TaskDetail[];
  canTasks: boolean;
  openTaskCount: number;
  onAdd: () => void;
  onComplete: (task: TaskDetail) => void;
  onReschedule: (task: TaskDetail, dueAt: Dayjs) => void | Promise<void>;
}

function TasksPanel({ lead, tasks, canTasks, openTaskCount, onAdd, onComplete, onReschedule }: TasksPanelProps) {
  return (
    <Card
      size="small"
      title={
        <Flex align="center" justify="space-between">
          <span>Follow-up tasks</span>
          {canTasks ? (
            <Button size="small" icon={<PlusOutlined />} onClick={onAdd}>
              Add
            </Button>
          ) : null}
        </Flex>
      }
    >
      {isActiveStage(lead.stage) && openTaskCount === 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="This active lead has no open task. Add one to keep it on track."
        />
      ) : null}
      {tasks.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tasks yet." />
      ) : (
        <List
          dataSource={tasks}
          renderItem={(task) => (
            <TaskRow
              task={task}
              canTasks={canTasks}
              onComplete={() => onComplete(task)}
              onReschedule={onReschedule}
            />
          )}
        />
      )}
    </Card>
  );
}

// ── Outreach & AI panel ───────────────────────────────────────────────────────────────────────

interface OutreachPanelProps {
  organizationId: string;
  leadId: string;
  accessToken: string | null;
  canWrite: boolean;
  canAi: boolean;
}

function OutreachPanel({ organizationId, leadId, accessToken, canAi }: OutreachPanelProps) {
  const { message } = App.useApp();
  const [outreachMessages, setOutreachMessages] = useState<OutreachMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // AI draft state
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftKind, setDraftKind] = useState<'sales_message' | 'follow_up_message'>('sales_message');
  const [draftChannel, setDraftChannel] = useState<OutreachChannel>('email');
  const [draftInstruction, setDraftInstruction] = useState('');
  const [drafting, setDrafting] = useState(false);

  // Advisory state
  const [meetingPrep, setMeetingPrep] = useState<AssistantMeetingPrep | null>(null);
  const [nextAction, setNextAction] = useState<AssistantNextAction | null>(null);
  const [advisory, setAdvisory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listMessages(organizationId, { leadId })
      .then((msgs) => { if (!cancelled) setOutreachMessages(msgs); })
      .catch(() => { if (!cancelled) setOutreachMessages([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [organizationId, leadId, reloadToken]);

  async function draftMessage() {
    if (!accessToken) return;
    setDrafting(true);
    try {
      await api.draftAssistantMessage(
        { accessToken, organizationId },
        { entityType: 'lead', entityId: leadId, kind: draftKind, channel: draftChannel, instruction: draftInstruction || undefined },
      );
      void message.success('Draft saved to outreach messages');
      setDraftOpen(false);
      setDraftInstruction('');
      setReloadToken((v) => v + 1);
    } catch (err) {
      void message.error(getErrorMessage(err));
    } finally {
      setDrafting(false);
    }
  }

  async function fetchMeetingPrep() {
    if (!accessToken) return;
    setAdvisory(true);
    try {
      const prep = await api.assistantMeetingPrep({ accessToken, organizationId }, 'lead', leadId);
      setMeetingPrep(prep);
    } catch (err) {
      void message.error(getErrorMessage(err));
    } finally {
      setAdvisory(false);
    }
  }

  async function fetchNextAction() {
    if (!accessToken) return;
    setAdvisory(true);
    try {
      const action = await api.assistantNextAction({ accessToken, organizationId }, 'lead', leadId);
      setNextAction(action);
    } catch (err) {
      void message.error(getErrorMessage(err));
    } finally {
      setAdvisory(false);
    }
  }

  return (
    <Flex vertical gap={12}>
      {canAi ? (
        <Card size="small" title={<Space><RobotOutlined />AI Assistant</Space>}>
          <Flex vertical gap={8}>
            <Space wrap>
              <Button size="small" icon={<MessageOutlined />} onClick={() => setDraftOpen(true)}>
                Draft message
              </Button>
              <Button size="small" icon={<CalendarOutlined />} loading={advisory} onClick={() => void fetchMeetingPrep()}>
                Meeting prep
              </Button>
              <Button size="small" icon={<BulbOutlined />} loading={advisory} onClick={() => void fetchNextAction()}>
                Next action
              </Button>
            </Space>

            {nextAction ? (
              <Alert
                type="info"
                showIcon
                message={nextAction.action}
                description={nextAction.reasoning ?? undefined}
                closable
                onClose={() => setNextAction(null)}
              />
            ) : null}

            {meetingPrep ? (
              <Card size="small" title="Meeting prep" extra={<Button size="small" type="text" onClick={() => setMeetingPrep(null)}>✕</Button>}>
                {meetingPrep.talkingPoints.length > 0 ? (
                  <>
                    <Text type="secondary" style={{ fontSize: 12 }}>Talking points</Text>
                    <List size="small" dataSource={meetingPrep.talkingPoints} renderItem={(p) => <List.Item>{p}</List.Item>} />
                  </>
                ) : null}
                {meetingPrep.questions.length > 0 ? (
                  <>
                    <Text type="secondary" style={{ fontSize: 12 }}>Questions to ask</Text>
                    <List size="small" dataSource={meetingPrep.questions} renderItem={(q) => <List.Item>{q}</List.Item>} />
                  </>
                ) : null}
                {meetingPrep.risks.length > 0 ? (
                  <>
                    <Text type="secondary" style={{ fontSize: 12 }}>Risks</Text>
                    <List size="small" dataSource={meetingPrep.risks} renderItem={(r) => <List.Item>{r}</List.Item>} />
                  </>
                ) : null}
              </Card>
            ) : null}
          </Flex>
        </Card>
      ) : null}

      <Card size="small" title="Recent messages" extra={loading ? <Tag>Loading…</Tag> : null}>
        {outreachMessages.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No messages yet." />
        ) : (
          <Timeline
            items={outreachMessages.slice(-10).map((m) => ({
              color: m.direction === 'outbound' ? 'blue' : m.direction === 'inbound' ? 'green' : 'gray',
              children: (
                <Flex vertical gap={2}>
                  <Space size={4}>
                    <Tag style={{ fontSize: 11 }}>{m.direction}</Tag>
                    <Tag style={{ fontSize: 11 }}>{m.channel}</Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(m.createdAt).fromNow()}</Text>
                  </Space>
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{m.body}</Text>
                </Flex>
              ),
            }))}
          />
        )}
      </Card>

      <Modal
        title="Draft outreach message"
        open={draftOpen}
        onCancel={() => setDraftOpen(false)}
        onOk={() => void draftMessage()}
        confirmLoading={drafting}
        okText="Generate & save draft"
      >
        <Flex vertical gap={12}>
          <Select value={draftKind} onChange={setDraftKind} options={[{ value: 'sales_message', label: 'Initial message' }, { value: 'follow_up_message', label: 'Follow-up' }]} />
          <Select<OutreachChannel>
            value={draftChannel}
            onChange={setDraftChannel}
            options={OUTREACH_CHANNELS.map((ch) => ({ value: ch, label: ch }))}
          />
          <Input.TextArea
            rows={3}
            placeholder="Optional instruction (e.g. 'offer a discovery call')"
            value={draftInstruction}
            onChange={(e) => setDraftInstruction(e.target.value)}
            maxLength={2000}
          />
        </Flex>
      </Modal>
    </Flex>
  );
}

// ── Proposals panel ───────────────────────────────────────────────────────────────────────────

interface ProposalsPanelProps {
  organizationId: string;
  leadId: string;
  accessToken: string | null;
  canAi: boolean;
}

const PROPOSAL_STATUS_COLOR: Record<string, string> = {
  draft: 'default',
  ready: 'blue',
  sent: 'processing',
  accepted: 'success',
  rejected: 'error',
  expired: 'warning',
};

function ProposalsPanel({ organizationId, leadId, accessToken, canAi }: ProposalsPanelProps) {
  const { message } = App.useApp();
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listProposals(organizationId, { entityType: 'lead', entityId: leadId })
      .then((items) => { if (!cancelled) setProposals(items); })
      .catch(() => { if (!cancelled) setProposals([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [organizationId, leadId, reloadToken]);

  async function generateProposal() {
    if (!accessToken) return;
    setGenerating(true);
    try {
      await api.generateProposal({ accessToken, organizationId }, { entityType: 'lead', entityId: leadId });
      message.success('Proposal generation started — it will appear here when ready.');
      // Poll briefly then reload
      setTimeout(() => setReloadToken((v) => v + 1), 4000);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card
      size="small"
      title="Proposals"
      extra={
        canAi ? (
          <Button size="small" icon={<SendOutlined />} loading={generating} onClick={() => void generateProposal()}>
            Generate
          </Button>
        ) : null
      }
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : proposals.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No proposals yet." />
      ) : (
        <List
          dataSource={proposals}
          renderItem={(p) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <Space>
                    <Text strong>{p.title}</Text>
                    <Tag color={PROPOSAL_STATUS_COLOR[p.status] ?? 'default'}>{p.status}</Tag>
                  </Space>
                }
                description={
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {p.value != null ? `${p.currency ?? ''} ${p.value.toLocaleString()} · ` : ''}
                    {dayjs(p.createdAt).fromNow()}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}

function duePill(task: TaskDetail) {
  if (!task.dueAt) return <Tag>No due date</Tag>;
  const due = dayjs(task.dueAt);
  const overdue = task.status === 'open' && due.isBefore(dayjs());
  return <Tag color={overdue ? 'error' : 'default'}>{overdue ? 'Overdue' : 'Due'} {due.fromNow()}</Tag>;
}

interface TaskRowProps {
  task: TaskDetail;
  canTasks: boolean;
  onComplete: () => void;
  onReschedule: (task: TaskDetail, dueAt: Dayjs) => void | Promise<void>;
}

function TaskRow({ task, canTasks, onComplete, onReschedule }: TaskRowProps) {
  return (
    <List.Item
      actions={
        canTasks && task.status === 'open'
          ? [
              <DatePicker
                key="reschedule"
                size="small"
                showTime
                value={null}
                placeholder="Reschedule"
                onChange={(value) => {
                  if (value) void onReschedule(task, value);
                }}
              />,
              <Button key="complete" size="small" type="primary" icon={<CheckOutlined />} onClick={onComplete}>
                Complete
              </Button>,
            ]
          : undefined
      }
    >
      <List.Item.Meta
        title={
          <Space size={[6, 6]} wrap>
            <Text strong>{task.title}</Text>
            <TaskStatusTag status={task.status} />
            <PriorityTag priority={task.priority} />
          </Space>
        }
        description={duePill(task)}
      />
    </List.Item>
  );
}

// ── Modals ────────────────────────────────────────────────────────────────────────────────────

interface AddTaskModalProps {
  open: boolean;
  organizationId: string | null;
  leadId: string;
  onClose: () => void;
  onDone: () => void;
}

function AddTaskModal({ open, organizationId, leadId, onClose, onDone }: AddTaskModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ title: string; priority: Priority; dueAt: Dayjs | null }>();
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!organizationId) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await createTask(organizationId, {
        leadId,
        title: values.title,
        priority: values.priority,
        dueAt: values.dueAt ? values.dueAt.toISOString() : undefined,
      });
      message.success('Task added');
      form.resetFields();
      onDone();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Add follow-up task" open={open} onCancel={onClose} onOk={submit} confirmLoading={submitting} okText="Add task">
      <Form form={form} layout="vertical" initialValues={{ priority: 'medium', dueAt: dayjs().add(1, 'day') }}>
        <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Title is required' }]}>
          <Input placeholder="Send follow-up email" maxLength={200} />
        </Form.Item>
        <Form.Item name="priority" label="Priority">
          <Select options={PRIORITIES.map((p) => ({ value: p, label: p }))} style={{ textTransform: 'capitalize' }} />
        </Form.Item>
        <Form.Item name="dueAt" label="Due">
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

interface CompleteTaskModalProps {
  task: TaskDetail | null;
  requireFollowUp: boolean;
  onClose: () => void;
  onDone: () => void;
}

function CompleteTaskModal({ task, requireFollowUp, onClose, onDone }: CompleteTaskModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ followUpTitle?: string; followUpDueAt: Dayjs | null }>();
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!task) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await completeTask({
        taskId: task.id,
        followUpTitle: values.followUpTitle?.trim() || undefined,
        followUpDueAt: values.followUpDueAt ? values.followUpDueAt.toISOString() : undefined,
      });
      message.success('Task completed');
      form.resetFields();
      onDone();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Complete task"
      open={task != null}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={submitting}
      okText="Complete"
      afterClose={() => form.resetFields()}
    >
      {requireFollowUp ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="This is the lead's only open task"
          description="An active lead must always have an open follow-up. Schedule the next one to complete this task."
        />
      ) : null}
      <Form form={form} layout="vertical" initialValues={{ followUpDueAt: dayjs().add(1, 'day') }}>
        <Form.Item
          name="followUpTitle"
          label={requireFollowUp ? 'Next follow-up' : 'Next follow-up (optional)'}
          rules={requireFollowUp ? [{ required: true, message: 'A follow-up is required for an active lead' }] : []}
        >
          <Input placeholder="Check back in a week" maxLength={200} />
        </Form.Item>
        <Form.Item name="followUpDueAt" label="Follow-up due">
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

interface CloseLeadModalProps {
  outcome: 'won' | 'lost' | null;
  leadId: string;
  onClose: () => void;
  onDone: () => void;
}

function CloseLeadModal({ outcome, leadId, onClose, onDone }: CloseLeadModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ reason?: string }>();
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!outcome) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await closeLead({ leadId, outcome, reason: values.reason?.trim() || undefined });
      message.success(`Lead marked ${outcome}`);
      form.resetFields();
      onDone();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={outcome === 'won' ? 'Close lead as won' : 'Close lead as lost'}
      open={outcome != null}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={submitting}
      okText={outcome === 'won' ? 'Mark won' : 'Mark lost'}
      okButtonProps={{ danger: outcome === 'lost' }}
      afterClose={() => form.resetFields()}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="reason" label="Reason">
          <Input.TextArea rows={3} maxLength={2000} placeholder="Why did this lead close?" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
