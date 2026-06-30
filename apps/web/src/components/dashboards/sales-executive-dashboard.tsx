
import { useEffect, useState } from 'react';
import {
  AlertOutlined,
  ArrowRightOutlined,
  ClockCircleOutlined,
  FireOutlined,
  ReloadOutlined,
  RobotOutlined,
  RocketOutlined,
  InboxOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Result,
  Row,
  Skeleton,
  Space,
  Tag,
  Typography,
  theme,
  Statistic,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAuth } from '@/lib/auth';
import {
  type ActionCenter,
  type ActionCenterOpportunity,
  getActionCenter,
} from '@/lib/opportunities';
import { listTasks } from '@/lib/tasks';
import { api } from '@/lib/api';
import type { TaskSummary, UsageMeReport } from '@radar/contracts';
import { PageHeader } from '@/components/page-header';
import { PageSection } from '@/components/ui/page-section';
import { OpportunityStatusTag, PriorityTag, ScoreTag } from '@/components/ui/status-tag';

const { Text, Paragraph } = Typography;

const LANE_LIMIT = 6;

function formatValue(value: number | null): string {
  return value == null ? 'Unestimated' : value.toLocaleString();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

function OpportunityCard({
  opportunity,
  onOpen,
}: {
  opportunity: ActionCenterOpportunity;
  onOpen: () => void;
}) {
  const { token } = theme.useToken();
  return (
    <div
      onClick={onOpen}
      style={{
        padding: 14,
        borderRadius: token.borderRadiusLG,
        border: `1px solid ${token.colorBorderSecondary}`,
        cursor: 'pointer',
        background: token.colorBgContainer,
      }}
    >
      <Flex vertical gap={10}>
        <Space size={[6, 6]} wrap>
          <OpportunityStatusTag status={opportunity.status} />
          <ScoreTag score={opportunity.score} />
          <PriorityTag priority={opportunity.priority} />
        </Space>
        <Text strong ellipsis style={{ display: 'block' }}>
          {opportunity.title}
        </Text>
        {opportunity.recommendedAction ? (
          <Flex gap={8} align="flex-start">
            <RobotOutlined style={{ color: token.colorPrimary, marginTop: 3 }} />
            <Text style={{ fontSize: 13 }}>{opportunity.recommendedAction}</Text>
          </Flex>
        ) : (
          <Text type="secondary" style={{ fontSize: 13 }}>
            No AI action recorded yet.
          </Text>
        )}
        <Flex gap={12} wrap justify="space-between">
          <Text type="secondary" style={{ fontSize: 12 }}>
            Value {formatValue(opportunity.potentialValue)}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Heat {Math.round(opportunity.heatScore)} · {dayjs(opportunity.createdAt).format('MMM D')}
          </Text>
        </Flex>
      </Flex>
    </div>
  );
}

function TaskCard({ task }: { task: TaskSummary }) {
  const { token } = theme.useToken();
  const isOverdue = task.dueAt && dayjs(task.dueAt).isBefore(dayjs(), 'day');
  return (
    <div
      style={{
        padding: 12,
        borderRadius: token.borderRadiusLG,
        border: `1px solid ${isOverdue ? token.colorErrorBorder : token.colorBorder}`,
        background: isOverdue ? token.colorErrorBg : token.colorBgContainer,
        cursor: 'default',
      }}
    >
      <Flex vertical gap={4}>
        <Text strong style={{ fontSize: 13 }}>{task.title}</Text>
        <Flex align="center" gap={6} wrap>
          <PriorityTag priority={task.priority} />
          {task.dueAt && (
            <Tag color={isOverdue ? 'red' : 'blue'} style={{ fontSize: 11 }}>
              {isOverdue ? 'Overdue' : 'Due'} {dayjs(task.dueAt).format('MMM D')}
            </Tag>
          )}
        </Flex>
      </Flex>
    </div>
  );
}

function FollowUpsLane({
  tasks,
  loading,
}: {
  tasks: TaskSummary[];
  loading: boolean;
}) {
  const { token } = theme.useToken();
  const overdue = tasks.filter((t) => t.dueAt && dayjs(t.dueAt).isBefore(dayjs(), 'day'));
  return (
    <Card style={{ height: '100%' }} styles={{ body: { padding: 18, height: '100%' } }}>
      <Flex vertical gap={14} style={{ height: '100%' }}>
        <Flex align="center" gap={10}>
          <span style={{ color: overdue.length > 0 ? token.colorError : token.colorPrimary, fontSize: 18 }}>
            <ClockCircleOutlined />
          </span>
          <Text strong>Follow-ups due</Text>
          {overdue.length > 0 && <Badge count={overdue.length} color="red" />}
        </Flex>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Overdue and today's follow-up tasks assigned to you.
        </Text>
        <div style={{ flex: 1 }}>
          {loading ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : tasks.length === 0 ? (
            <Empty
              image={<CheckCircleOutlined style={{ fontSize: 32, color: token.colorSuccess }} />}
              description="You're all caught up — no overdue or due-today tasks."
            />
          ) : (
            <Flex vertical gap={8}>
              {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </Flex>
          )}
        </div>
      </Flex>
    </Card>
  );
}

function Lane({
  title,
  icon,
  hint,
  loading,
  emptyText,
  items,
  onOpen,
  footer,
}: {
  title: string;
  icon: React.ReactNode;
  hint: string;
  loading: boolean;
  emptyText: string;
  items: ActionCenterOpportunity[];
  onOpen: (id: string) => void;
  footer?: React.ReactNode;
}) {
  const { token } = theme.useToken();
  return (
    <Card style={{ height: '100%' }} styles={{ body: { padding: 18, height: '100%' } }}>
      <Flex vertical gap={14} style={{ height: '100%' }}>
        <Flex align="center" gap={10}>
          <span style={{ color: token.colorPrimary, fontSize: 18 }}>{icon}</span>
          <Text strong>{title}</Text>
        </Flex>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {hint}
        </Text>
        <div style={{ flex: 1 }}>
          {loading ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : items.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
          ) : (
            <Flex vertical gap={10}>
              {items.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  onOpen={() => onOpen(opportunity.id)}
                />
              ))}
            </Flex>
          )}
        </div>
        {footer}
      </Flex>
    </Card>
  );
}

function SimpleMetricCard({
  title,
  value,
  icon,
  hint,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  hint?: string;
}) {
  const { token } = theme.useToken();
  return (
    <Card styles={{ body: { padding: 18 } }}>
      <Flex vertical gap={10}>
        <Flex align="center" gap={10}>
          <span style={{ color: token.colorPrimary, fontSize: 18 }}>{icon}</span>
          <Text strong type="secondary">{title}</Text>
        </Flex>
        <Statistic valueRender={() => <>{value}</>} />
        {hint && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {hint}
          </Text>
        )}
      </Flex>
    </Card>
  );
}

export function SalesExecutiveDashboard() {
  const { currentOrg, can, accessToken, session } = useAuth();
  const userId = session?.user.id ?? null;
  const navigate = useNavigate();
  const { token } = theme.useToken();

  const organizationId = currentOrg?.organizationId ?? null;
  const canRead = can('opportunities.read');

  const [data, setData] = useState<ActionCenter>({ highValue: [], urgent: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [usage, setUsage] = useState<UsageMeReport | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const [followUpTasks, setFollowUpTasks] = useState<TaskSummary[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!organizationId || !canRead) {
      setData({ highValue: [], urgent: [] });
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getActionCenter(organizationId, LANE_LIMIT)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData({ highValue: [], urgent: [] });
        setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, canRead, reloadToken]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setUsageLoading(true);
    void api.usageMe({ accessToken, organizationId: organizationId ?? '' })
      .then(res => {
        if (!cancelled) setUsage(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => { cancelled = true; };
  }, [accessToken, organizationId, reloadToken]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setTasksLoading(true);
    Promise.all([
      listTasks(organizationId, { queue: 'overdue', assignedTo: userId ?? undefined, page: 1, pageSize: LANE_LIMIT }),
      listTasks(organizationId, { queue: 'today', assignedTo: userId ?? undefined, page: 1, pageSize: LANE_LIMIT }),
    ])
      .then(([overdue, today]) => {
        if (!cancelled) setFollowUpTasks([...overdue.items, ...today.items].slice(0, LANE_LIMIT));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTasksLoading(false); });
    return () => { cancelled = true; };
  }, [organizationId, userId, reloadToken]);

  function openOpportunity() {
    navigate('/opportunities');
  }

  if (!currentOrg) {
    return (
      <Result
        status="info"
        title="No workspace yet"
        subTitle="Join or create a workspace to start surfacing your best moves."
      />
    );
  }

  const isEmpty = !loading && !error && data.highValue.length === 0 && data.urgent.length === 0;

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Sales Executive"
        title={`Welcome, ${currentOrg.roleSlug === 'sales_executive' ? 'Sales Exec' : 'Member'}`}
        subtitle="What should you do next that has the highest chance of winning revenue?"
        extra={
          <Space>
            {canRead ? (
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setReloadToken((value) => value + 1)}
                loading={loading}
              >
                Refresh
              </Button>
            ) : null}
            {can('discoveries.write') ? (
              <Button type="primary" icon={<RocketOutlined />} onClick={() => navigate('/capture')}>
                Capture an opportunity
              </Button>
            ) : null}
          </Space>
        }
      />

      {!canRead ? (
        <Alert
          type="info"
          showIcon
          title="Opportunities are not visible for this member"
          description="Your current role does not include opportunities.read, so the action lanes are hidden."
        />
      ) : error ? (
        <Alert type="error" showIcon title={error} />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
               <SimpleMetricCard
                title="Captures Waiting (Inbox)"
                value={<span style={{ fontSize: 32, fontWeight: 600 }}>0</span>}
                icon={<InboxOutlined />}
                hint="Waiting for analysis or approval. (Stub)"
              />
            </Col>
            <Col xs={24} md={12}>
               <SimpleMetricCard
                title="My AI Usage (30d)"
                value={
                  <span style={{ fontSize: 32, fontWeight: 600 }}>
                    {usageLoading ? <Skeleton.Button active size="small" /> : usage ? usage.totals.requests : 0}
                  </span>
                }
                icon={<BarChartOutlined />}
                hint="AI requests you've triggered across the workspace."
              />
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ alignItems: 'stretch' }}>
            <Col xs={24} md={12} lg={8}>
              <Lane
                title="High-value opportunities"
                icon={<FireOutlined />}
                hint="The best near-term revenue signals, ranked by score."
                loading={loading}
                emptyText="No open opportunities yet. Approve discoveries in the Inbox to convert them."
                items={data.highValue}
                onOpen={openOpportunity}
              />
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Lane
                title="Urgent actions"
                icon={<AlertOutlined />}
                hint="Critical and high-priority opportunities that need a move now."
                loading={loading}
                emptyText="Nothing urgent right now — you're on top of the high-priority work."
                items={data.urgent}
                onOpen={openOpportunity}
              />
            </Col>
            <Col xs={24} md={12} lg={8}>
              <FollowUpsLane tasks={followUpTasks} loading={tasksLoading} />
            </Col>
          </Row>
        </>
      )}

      {isEmpty ? (
        <PageSection
          title="Build your decision engine"
          subtitle={`Start by capturing opportunities and tuning your Company Brain. As discoveries flow in and analysis comes online, this homepage fills with the highest-value moves for ${currentOrg?.organizationName ?? 'your workspace'}.`}
          style={{
            background:
              'linear-gradient(135deg, rgba(61,220,151,0.10), rgba(56,189,248,0.04)), var(--bg-container)',
            borderColor: token.colorBorder,
          }}
          extra={
            <Flex gap={8}>
              <Button onClick={() => navigate('/settings/company-brain')}>Company Brain</Button>
              <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate('/inbox')}>
                Open Inbox
              </Button>
            </Flex>
          }
        >
          <Flex align="center" justify="space-between" gap={16} wrap>
            <Flex vertical gap={4} style={{ maxWidth: 640 }}>
              <Flex align="center" gap={8}>
                <RocketOutlined style={{ color: token.colorPrimary }} />
                <Tag variant="filled" color="processing">
                  Discovery path
                </Tag>
              </Flex>
              <Paragraph type="secondary" style={{ margin: 0 }}>
                Discovery quality still matters more than quantity at this stage. Keep captures
                structured and clean so scoring and action-planning have reliable input.
              </Paragraph>
            </Flex>
          </Flex>
        </PageSection>
      ) : null}
    </Flex>
  );
}
