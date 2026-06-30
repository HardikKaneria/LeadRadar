import { useEffect, useState, useCallback } from 'react';
import {
  Card, Col, Row, Skeleton, Statistic, Table, Tag, Typography, App,
  Button, Modal, Select, Space, Progress, Tooltip, Divider,
} from 'antd';
import {
  ReloadOutlined, CreditCardOutlined, CheckCircleOutlined,
  CloseCircleOutlined, EditOutlined, RocketOutlined,
} from '@ant-design/icons';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { UsageCompanySummaryReport } from '@radar/contracts';

const { Text } = Typography;

const PLAN_COLOR: Record<string, string> = {
  starter: 'default',
  growth:  'blue',
  scale:   'purple',
};

const RESOURCE_LABEL: Record<string, string> = {
  ai_requests:   'AI analyses',
  discoveries:   'Discoveries',
  opportunities: 'Opportunities',
  seats:         'Seats',
};

function UsageBar({ used, max, label }: { used: number; max: number; label: string }) {
  if (max === -1) {
    return (
      <div style={{ marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
        <div style={{ fontSize: 12 }}>{used.toLocaleString()} <Text type="secondary">/ unlimited</Text></div>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((used / max) * 100));
  const status = pct >= 100 ? 'exception' : pct >= 80 ? 'active' : 'normal';
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <Text type="secondary">{label}</Text>
        <Text>{used.toLocaleString()} / {max.toLocaleString()}</Text>
      </div>
      <Progress percent={pct} size="small" status={status} showInfo={false} />
    </div>
  );
}

// ── Assign Plan Modal ────────────────────────────────────────────────────────
function AssignPlanModal({
  org,
  plans,
  currentSlug,
  onClose,
  onSaved,
}: {
  org: { id: string; name: string } | null;
  plans: any[];
  currentSlug?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { accessToken, currentOrg } = useAuth();
  const { message } = App.useApp();
  const [selectedSlug, setSelectedSlug] = useState(currentSlug ?? 'starter');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!org || !accessToken || !currentOrg) return;
    setSaving(true);
    try {
      await api.adminAssignPlan(
        { accessToken, organizationId: currentOrg.organizationId },
        { organizationId: org.id, planSlug: selectedSlug },
      );
      void message.success(`Plan updated to "${selectedSlug}" for ${org.name}`);
      onSaved();
      onClose();
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Failed to assign plan');
    } finally {
      setSaving(false);
    }
  }

  const selected = plans.find((p) => p.slug === selectedSlug);

  return (
    <Modal
      open={!!org}
      title={`Change plan — ${org?.name}`}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="Save plan"
      width={520}
    >
      <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size={16}>
        <Select
          value={selectedSlug}
          onChange={setSelectedSlug}
          style={{ width: '100%' }}
          size="large"
          options={plans.map((p) => ({
            value: p.slug,
            label: (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  <Tag color={PLAN_COLOR[p.slug] ?? 'default'} style={{ marginRight: 8 }}>
                    {p.name}
                  </Tag>
                </span>
                <Text type="secondary">
                  {p.monthlyPrice === 0 ? 'Free' : `$${(p.monthlyPrice / 100).toFixed(0)}/mo`}
                </Text>
              </div>
            ),
          }))}
        />

        {selected && (
          <Card size="small" style={{ background: '#fafafa' }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              {selected.name} limits
            </Text>
            {selected.limits.map((l: any) => (
              <div key={l.resourceType} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <Text type="secondary">{RESOURCE_LABEL[l.resourceType] ?? l.resourceType}</Text>
                <Text strong>{l.maxValue === -1 ? 'Unlimited' : l.maxValue.toLocaleString()}</Text>
              </div>
            ))}
            <Divider style={{ margin: '10px 0' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>Features: {(selected.features as string[]).join(' · ')}</Text>
          </Card>
        )}
      </Space>
    </Modal>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AdminBillingPage() {
  const { accessToken, currentOrg, isPlatformAdmin } = useAuth();
  const { message } = App.useApp();
  const ctx = { accessToken: accessToken ?? '', organizationId: currentOrg?.organizationId ?? '' };

  const [usageReport, setUsageReport] = useState<UsageCompanySummaryReport | null>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [allOrgs, setAllOrgs] = useState<{ id: string; name: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Assign modal state
  const [assignTarget, setAssignTarget] = useState<{ id: string; name: string } | null>(null);
  const [assignCurrentSlug, setAssignCurrentSlug] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!accessToken || !isPlatformAdmin) return;
    setLoading(true);
    try {
      const [usageRes, subsRes, plansRes, orgsRes] = await Promise.all([
        api.usageCompanySummary(ctx).catch(() => null),
        api.adminListSubscriptions(ctx),
        api.billingPlans(),
        api.adminListOrganizations(ctx),
      ]);
      setUsageReport(usageRes);
      setSubscriptions(subsRes ?? []);
      setPlans(plansRes ?? []);
      setAllOrgs(orgsRes ?? []);
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, [accessToken, isPlatformAdmin]);

  useEffect(() => { void load(); }, [load]);

  const report = usageReport as any;
  const usageOrgs = report?.organizations ?? [];
  const totals = report?.totals ?? {};

  // Usage map keyed by org id for quick lookup
  const usageByOrg: Record<string, any> = {};
  usageOrgs.forEach((o: any) => { usageByOrg[o.organizationId] = o; });

  // Merge subscriptions into org rows by id
  const subByOrg: Record<string, any> = {};
  subscriptions.forEach((s) => {
    if (s.organization?.id) subByOrg[s.organization.id] = s;
  });

  function openAssign(orgId: string, orgName: string) {
    const sub = subByOrg[orgId];
    setAssignCurrentSlug(sub?.plan?.slug ?? 'starter');
    setAssignTarget({ id: orgId, name: orgName });
  }

  // Subscriptions table columns
  const subColumns = [
    {
      title: 'Organisation',
      key: 'org',
      render: (_: any, row: any) => (
        <div>
          <Text strong>{row.organization?.name ?? '—'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{row.organization?.id?.slice(0, 8)}…</Text>
        </div>
      ),
    },
    {
      title: 'Plan',
      key: 'plan',
      render: (_: any, row: any) => (
        <Tag color={PLAN_COLOR[row.plan?.slug] ?? 'default'}>
          {row.plan?.name ?? '—'}
        </Tag>
      ),
    },
    {
      title: 'Price',
      key: 'price',
      render: (_: any, row: any) =>
        row.plan?.monthly_price === 0
          ? 'Free'
          : `$${((row.plan?.monthly_price ?? 0) / 100).toFixed(0)}/mo`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) =>
        s === 'active'
          ? <Tag icon={<CheckCircleOutlined />} color="success">Active</Tag>
          : <Tag icon={<CloseCircleOutlined />} color="default">{s}</Tag>,
    },
    {
      title: 'Period ends',
      dataIndex: 'current_period_end',
      key: 'period_end',
      render: (d: string) => d ? new Date(d).toLocaleDateString() : '—',
    },
    {
      title: '',
      key: 'actions',
      render: (_: any, row: any) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => openAssign(row.organization?.id, row.organization?.name ?? 'Unknown')}
        >
          Change plan
        </Button>
      ),
    },
  ];

  // All-orgs table — shows every org regardless of usage or subscription status
  const allOrgsColumns = [
    {
      title: 'Organisation',
      key: 'org',
      render: (_: any, row: { id: string; name: string; created_at: string }) => (
        <div>
          <Text strong>{row.name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{row.id.slice(0, 8)}…</Text>
        </div>
      ),
    },
    {
      title: 'Plan',
      key: 'plan',
      render: (_: any, row: { id: string }) => {
        const sub = subByOrg[row.id];
        return sub
          ? <Tag color={PLAN_COLOR[sub.plan?.slug] ?? 'default'}>{sub.plan?.name}</Tag>
          : <Tag color="default">No plan</Tag>;
      },
    },
    {
      title: 'AI requests (30d)',
      key: 'requests',
      render: (_: any, row: { id: string }) => {
        const u = usageByOrg[row.id];
        return u ? Number(u.totalRequests || 0).toLocaleString() : '—';
      },
    },
    {
      title: 'Est. cost',
      key: 'cost',
      render: (_: any, row: { id: string }) => {
        const u = usageByOrg[row.id];
        return u ? `$${Number(u.totalEstimatedCost || 0).toFixed(4)}` : '—';
      },
    },
    {
      title: 'Created',
      key: 'created',
      render: (_: any, row: { created_at: string }) =>
        new Date(row.created_at).toLocaleDateString(),
    },
    {
      title: '',
      key: 'actions',
      render: (_: any, row: { id: string; name: string }) => {
        const sub = subByOrg[row.id];
        return (
          <Button
            size="small"
            type={sub ? 'default' : 'primary'}
            icon={sub ? <EditOutlined /> : <RocketOutlined />}
            onClick={() => openAssign(row.id, row.name)}
          >
            {sub ? 'Change plan' : 'Grant plan'}
          </Button>
        );
      },
    },
  ];

  // Plan overview cards
  const planCards = plans.map((plan) => {
    const subsOnPlan = subscriptions.filter((s) => s.plan?.slug === plan.slug && s.status === 'active').length;
    return (
      <Col xs={24} sm={8} key={plan.slug}>
        <Card
          title={
            <Space>
              <Tag color={PLAN_COLOR[plan.slug] ?? 'default'} style={{ margin: 0 }}>{plan.name}</Tag>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {plan.monthlyPrice === 0 ? 'Free' : `$${(plan.monthlyPrice / 100).toFixed(0)}/mo`}
              </Text>
            </Space>
          }
          size="small"
        >
          <Statistic value={subsOnPlan} suffix="active orgs" style={{ marginBottom: 12 }} />
          {plan.limits.map((l: any) => (
            <div key={l.resourceType} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <Text type="secondary">{RESOURCE_LABEL[l.resourceType] ?? l.resourceType}</Text>
              <Text>{l.maxValue === -1 ? '∞' : l.maxValue.toLocaleString()}</Text>
            </div>
          ))}
        </Card>
      </Col>
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Billing & Subscriptions"
        subtitle="Manage plans, grant subscriptions, and monitor usage across all organisations."
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            Refresh
          </Button>
        }
      />

      {/* Platform totals */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic title="Total platform cost (30d)" prefix="$" value={Number(totals.estimatedCost || 0).toFixed(4)} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic title="AI requests (30d)" value={Number(totals.requests || 0).toLocaleString()} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic title="Active subscriptions" value={subscriptions.filter((s) => s.status === 'active').length} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card>
            <Statistic title="Orgs without plan" value={allOrgs.filter((o) => !subByOrg[o.id]).length} />
          </Card>
        </Col>
      </Row>

      {/* Plan overview */}
      <Card title="Plans" variant="borderless">
        {loading ? <Skeleton active paragraph={{ rows: 3 }} /> : (
          <Row gutter={[16, 16]}>{planCards}</Row>
        )}
      </Card>

      {/* Subscriptions */}
      <Card title="Active subscriptions" variant="borderless">
        {loading ? <Skeleton active paragraph={{ rows: 5 }} /> : (
          <Table
            columns={subColumns}
            dataSource={subscriptions}
            rowKey="id"
            pagination={{ pageSize: 15 }}
            size="small"
          />
        )}
      </Card>

      {/* All orgs — grant / change plans */}
      <Card title="All organisations" variant="borderless">
        {loading ? <Skeleton active paragraph={{ rows: 6 }} /> : (
          <Table
            columns={allOrgsColumns}
            dataSource={allOrgs}
            rowKey="id"
            pagination={{ pageSize: 20 }}
            size="small"
          />
        )}
      </Card>

      {/* Assign plan modal */}
      <AssignPlanModal
        org={assignTarget}
        plans={plans}
        currentSlug={assignCurrentSlug}
        onClose={() => setAssignTarget(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}
