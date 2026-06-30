import { useEffect, useMemo, useState } from 'react';
import { DeleteOutlined, EditOutlined, ExperimentOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Result,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  type TableProps,
} from 'antd';
import type {
  ExternalProviderAccountAdminDto,
  ExternalProviderAlertEventAdminDto,
  ExternalProviderAlertRuleAdminDto,
  ExternalProviderApiKeyAdminDto,
  ExternalProviderHealthCheckAdminDto,
  ExternalProviderPlanProfileAdminDto,
  ExternalProviderReconciliationAdminDto,
  ExternalProviderRouteAdminDto,
  ExternalProviderTestRunAdminDto,
  ExternalProviderUsageAdminSummary,
  ExternalProviderUsageEventAdminDto,
  ExternalProviderUsageForecastAdminSummary,
  ExternalProviderUsageSnapshotAdminDto,
  ExternalCostRuleAdminDto,
  ExternalOptionMultiplierAdminDto,
  ExternalEndpointCatalogAdminDto,
  ExternalCostAdjustmentAdminDto,
  ExternalCostSimulatorInput,
  ExternalCostSimulatorResult,
} from '@radar/contracts';
import {
  EXTERNAL_API_KEY_STATUSES,
  EXTERNAL_BILLING_EVENTS,
  EXTERNAL_COST_RULE_SCOPES,
  EXTERNAL_PROVIDER_ACCOUNT_STATUSES,
  EXTERNAL_PROVIDER_ACCOUNT_TYPES,
  EXTERNAL_PROVIDER_PLAN_TYPES,
  EXTERNAL_PROVIDER_RENEWAL_INTERVALS,
  EXTERNAL_PROVIDER_TASK_TYPES,
  EXTERNAL_PROVIDER_UNIT_TYPES,
  EXTERNAL_PROVIDERS,
} from '@radar/contracts';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const { Text } = Typography;

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat().format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleString();
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonInput(label: string, value: unknown): unknown {
  if (typeof value !== 'string' || value.trim().length === 0) return {};
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function statusTagColor(value: string): string {
  switch (value) {
    case 'active':
    case 'ok':
    case 'passed':
    case 'success':
    case 'renewed':
      return 'success';
    case 'limited':
    case 'cooldown':
    case 'warning':
    case 'degraded':
    case 'running':
      return 'warning';
    case 'critical':
    case 'failed':
    case 'down':
    case 'exhausted':
    case 'expired':
    case 'suspended':
      return 'error';
    default:
      return 'default';
  }
}

export default function AdminExternalProvidersPage() {
  const { accessToken, currentOrg, isPlatformAdmin } = useAuth();
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [plans, setPlans] = useState<ExternalProviderPlanProfileAdminDto[]>([]);
  const [accounts, setAccounts] = useState<ExternalProviderAccountAdminDto[]>([]);
  const [keys, setKeys] = useState<ExternalProviderApiKeyAdminDto[]>([]);
  const [routes, setRoutes] = useState<ExternalProviderRouteAdminDto[]>([]);
  const [health, setHealth] = useState<ExternalProviderHealthCheckAdminDto[]>([]);
  const [usage, setUsage] = useState<ExternalProviderUsageAdminSummary | null>(null);
  const [forecast, setForecast] = useState<ExternalProviderUsageForecastAdminSummary | null>(null);
  const [events, setEvents] = useState<ExternalProviderUsageEventAdminDto[]>([]);
  const [snapshots, setSnapshots] = useState<ExternalProviderUsageSnapshotAdminDto[]>([]);
  const [alerts, setAlerts] = useState<{
    rules: ExternalProviderAlertRuleAdminDto[];
    events: ExternalProviderAlertEventAdminDto[];
  }>({ rules: [], events: [] });
  const [testRuns, setTestRuns] = useState<ExternalProviderTestRunAdminDto[]>([]);
  const [reconciliations, setReconciliations] = useState<ExternalProviderReconciliationAdminDto[]>([]);

  const [costRules, setCostRules] = useState<ExternalCostRuleAdminDto[]>([]);
  const [optionMultipliers, setOptionMultipliers] = useState<ExternalOptionMultiplierAdminDto[]>([]);
  const [endpointCatalog, setEndpointCatalog] = useState<ExternalEndpointCatalogAdminDto[]>([]);
  const [costAdjustments, setCostAdjustments] = useState<ExternalCostAdjustmentAdminDto[]>([]);
  const [simulatorResult, setSimulatorResult] = useState<ExternalCostSimulatorResult | null>(null);
  const [simulatorLoading, setSimulatorLoading] = useState(false);

  const [costRuleModalOpen, setCostRuleModalOpen] = useState(false);
  const [costRuleEditing, setCostRuleEditing] = useState<ExternalCostRuleAdminDto | null>(null);
  const [optionMultiplierModalOpen, setOptionMultiplierModalOpen] = useState(false);
  const [endpointModalOpen, setEndpointModalOpen] = useState(false);

  const [costRuleForm] = Form.useForm();
  const [optionMultiplierForm] = Form.useForm();
  const [endpointForm] = Form.useForm();
  const [simulatorForm] = Form.useForm();

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planEditing, setPlanEditing] = useState<ExternalProviderPlanProfileAdminDto | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountEditing, setAccountEditing] = useState<ExternalProviderAccountAdminDto | null>(null);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyEditing, setKeyEditing] = useState<ExternalProviderApiKeyAdminDto | null>(null);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [routeEditing, setRouteEditing] = useState<ExternalProviderRouteAdminDto | null>(null);

  const [planForm] = Form.useForm();
  const [accountForm] = Form.useForm();
  const [keyForm] = Form.useForm();
  const [routeForm] = Form.useForm();

  const ctx = useMemo(
    () =>
      accessToken && currentOrg
        ? { accessToken, organizationId: currentOrg.organizationId }
        : null,
    [accessToken, currentOrg],
  );

  const totalRemainingUnits = snapshots.reduce((sum, snapshot) => sum + snapshot.remainingUnits, 0);
  const newAlertsCount = alerts.events.filter((event) => event.status === 'new').length;

  async function loadAll() {
    if (!ctx || !isPlatformAdmin) return;
    setLoading(true);
    try {
      const [
        planRes,
        accountRes,
        keyRes,
        routeRes,
        healthRes,
        usageRes,
        forecastRes,
        eventsRes,
        snapshotsRes,
        alertsRes,
        testRunsRes,
        reconciliationsRes,
        costRulesRes,
        optionMultipliersRes,
        endpointCatalogRes,
        costAdjustmentsRes,
      ] = await Promise.all([
        api.adminExternalProviderPlans(ctx),
        api.adminExternalProviderAccounts(ctx),
        api.adminExternalProviderKeys(ctx),
        api.adminExternalProviderRoutes(ctx),
        api.adminExternalProviderHealth(ctx, 100),
        api.adminExternalProviderUsage(ctx),
        api.adminExternalProviderUsageForecast(ctx),
        api.adminExternalProviderUsageEvents(ctx, { limit: 150 }),
        api.adminExternalProviderUsageSnapshots(ctx, { limit: 150 }),
        api.adminExternalProviderAlerts(ctx, 150),
        api.adminExternalProviderTestRuns(ctx, 100),
        api.adminExternalProviderReconciliations(ctx, 100),
        api.adminExternalCostRules(ctx),
        api.adminExternalOptionMultipliers(ctx),
        api.adminExternalEndpointCatalog(ctx),
        api.adminExternalCostAdjustments(ctx),
      ]);

      setPlans(planRes.items);
      setAccounts(accountRes.items);
      setKeys(keyRes.items);
      setRoutes(routeRes.items);
      setHealth(healthRes.items);
      setUsage(usageRes);
      setForecast(forecastRes);
      setEvents(eventsRes.items);
      setSnapshots(snapshotsRes.items);
      setAlerts(alertsRes);
      setTestRuns(testRunsRes.items);
      setReconciliations(reconciliationsRes.items);
      setCostRules(costRulesRes.items ?? []);
      setOptionMultipliers(optionMultipliersRes.items ?? []);
      setEndpointCatalog(endpointCatalogRes.items ?? []);
      setCostAdjustments(costAdjustmentsRes.items ?? []);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load external provider control plane');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [ctx, isPlatformAdmin]);

  if (!ctx) {
    return <Result status="info" title="Sign in to manage external providers" />;
  }
  if (!isPlatformAdmin) {
    return <Result status="403" title="Only platform admins can manage external providers" />;
  }

  async function runAction(label: string, action: () => Promise<void>) {
    setBusyAction(label);
    try {
      await action();
    } catch (err) {
      message.error(err instanceof Error ? err.message : `Failed to run ${label}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function submitPlan(values: Record<string, unknown>) {
    if (!ctx) return;
    setBusyAction('plan-submit');
    try {
      const payload = {
        ...values,
        costRules: parseJsonInput('Cost rules', values.costRules),
        testPayloadJson: parseJsonInput('Test payload JSON', values.testPayloadJson),
        expectedResponseShapeJson: parseJsonInput(
          'Expected response shape JSON',
          values.expectedResponseShapeJson,
        ),
      };

      if (planEditing) {
        await api.updateAdminExternalProviderPlan(ctx, planEditing.id, payload);
        message.success('Plan profile updated');
      } else {
        await api.createAdminExternalProviderPlan(ctx, payload);
        message.success('Plan profile created');
      }

      setPlanModalOpen(false);
      setPlanEditing(null);
      planForm.resetFields();
      await loadAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save plan profile');
    } finally {
      setBusyAction(null);
    }
  }

  async function submitAccount(values: Record<string, unknown>) {
    if (!ctx) return;
    setBusyAction('account-submit');
    try {
      if (accountEditing) {
        await api.updateAdminExternalProviderAccount(ctx, accountEditing.id, values as never);
        message.success('Provider account updated');
      } else {
        await api.createAdminExternalProviderAccount(ctx, values as never);
        message.success('Provider account created');
      }

      setAccountModalOpen(false);
      setAccountEditing(null);
      accountForm.resetFields();
      await loadAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save provider account');
    } finally {
      setBusyAction(null);
    }
  }

  async function submitKey(values: Record<string, unknown>) {
    if (!ctx) return;
    setBusyAction('key-submit');
    try {
      if (keyEditing) {
        await api.updateAdminExternalProviderKey(ctx, keyEditing.id, values as never);
        message.success('API key updated');
      } else {
        await api.createAdminExternalProviderKey(ctx, values as never);
        message.success('API key created');
      }

      setKeyModalOpen(false);
      setKeyEditing(null);
      keyForm.resetFields();
      await loadAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setBusyAction(null);
    }
  }

  async function submitRoute(values: Record<string, unknown>) {
    if (!ctx) return;
    setBusyAction('route-submit');
    try {
      if (routeEditing) {
        await api.updateAdminExternalProviderRoute(ctx, routeEditing.taskType, values as never);
        message.success('Route updated');
      } else {
        await api.createAdminExternalProviderRoute(ctx, values);
        message.success('Route created');
      }

      setRouteModalOpen(false);
      setRouteEditing(null);
      routeForm.resetFields();
      await loadAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save route');
    } finally {
      setBusyAction(null);
    }
  }

  async function submitCostRule(values: Record<string, unknown>) {
    if (!ctx) return;
    setBusyAction('cost-rule-submit');
    try {
      const payload = {
        ...values,
        formulaJson: parseJsonInput('Formula JSON', values.formulaJson),
        conditionsJson: parseJsonInput('Conditions JSON', values.conditionsJson),
      };
      if (costRuleEditing) {
        await api.updateAdminExternalCostRule(ctx, costRuleEditing.id, payload);
        message.success('Cost rule updated');
      } else {
        await api.createAdminExternalCostRule(ctx, payload);
        message.success('Cost rule created');
      }
      setCostRuleModalOpen(false);
      setCostRuleEditing(null);
      costRuleForm.resetFields();
      await loadAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save cost rule');
    } finally {
      setBusyAction(null);
    }
  }

  async function submitOptionMultiplier(values: Record<string, unknown>) {
    if (!ctx) return;
    setBusyAction('multiplier-submit');
    try {
      const payload = { ...values, appliesToTaskTypes: values.appliesToTaskTypes ?? [] };
      await api.upsertAdminExternalOptionMultiplier(ctx, payload);
      message.success('Option multiplier saved');
      setOptionMultiplierModalOpen(false);
      optionMultiplierForm.resetFields();
      await loadAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save option multiplier');
    } finally {
      setBusyAction(null);
    }
  }

  async function submitEndpoint(values: Record<string, unknown>) {
    if (!ctx) return;
    setBusyAction('endpoint-submit');
    try {
      const payload = { ...values, taskTypes: values.taskTypes ?? [], testPayloadJson: parseJsonInput('Test payload', values.testPayloadJson) };
      await api.upsertAdminExternalEndpoint(ctx, payload);
      message.success('Endpoint saved');
      setEndpointModalOpen(false);
      endpointForm.resetFields();
      await loadAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save endpoint');
    } finally {
      setBusyAction(null);
    }
  }

  async function runSimulator(values: Record<string, unknown>) {
    if (!ctx) return;
    setSimulatorLoading(true);
    setSimulatorResult(null);
    try {
      const result = await api.runAdminExternalCostSimulator(ctx, values as unknown as ExternalCostSimulatorInput);
      setSimulatorResult(result);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Simulator failed');
    } finally {
      setSimulatorLoading(false);
    }
  }

  async function runKeyTest(key: ExternalProviderApiKeyAdminDto) {
    if (!ctx) return;
    await runAction(`test-key-${key.id}`, async () => {
      const result = await api.testAdminExternalProviderKey(ctx, key.id);
      message.success(
        `Test ${result.result.status} · ${formatNumber(result.result.estimatedUnitsUsed)} units · ${result.result.latencyMs ?? 0}ms`,
      );
      await loadAll();
    });
  }

  function openPlanModal(plan?: ExternalProviderPlanProfileAdminDto) {
    setPlanEditing(plan ?? null);
    planForm.setFieldsValue(
      plan
        ? {
            ...plan,
            costRules: formatJson(plan.costRules),
            testPayloadJson: formatJson(plan.testPayloadJson),
            expectedResponseShapeJson: formatJson(plan.expectedResponseShapeJson),
          }
        : {
            renewalTimezone: 'UTC',
            costRules: formatJson({ task_rules: {} }),
            testPayloadJson: formatJson({}),
            expectedResponseShapeJson: formatJson({}),
            overageEnabled: false,
            testEnabled: false,
            testConsumesCredits: false,
            isActive: true,
          },
    );
    setPlanModalOpen(true);
  }

  function openAccountModal(account?: ExternalProviderAccountAdminDto) {
    setAccountEditing(account ?? null);
    accountForm.setFieldsValue(
      account
        ? account
        : {
            status: 'active',
            allowedOrganizationIds: [],
          },
    );
    setAccountModalOpen(true);
  }

  function openKeyModal(key?: ExternalProviderApiKeyAdminDto) {
    setKeyEditing(key ?? null);
    keyForm.setFieldsValue(
      key
        ? key
        : {
            status: 'active',
            environment: 'production',
            allowedTaskTypes: [],
            allowedOrganizationIds: [],
            priority: 100,
          },
    );
    setKeyModalOpen(true);
  }

  function openRouteModal(route?: ExternalProviderRouteAdminDto) {
    setRouteEditing(route ?? null);
    routeForm.setFieldsValue(
      route
        ? route
        : {
            allowManualFallback: false,
            requiresBrowser: false,
            requiresJson: true,
            isActive: true,
            maxAttempts: 1,
          },
    );
    setRouteModalOpen(true);
  }

  const planColumns: TableProps<ExternalProviderPlanProfileAdminDto>['columns'] = [
    { title: 'Provider', dataIndex: 'provider', key: 'provider', render: (value: string) => <Tag>{value}</Tag> },
    { title: 'Plan', dataIndex: 'planName', key: 'planName' },
    { title: 'Type', dataIndex: 'planType', key: 'planType' },
    { title: 'Unit', dataIndex: 'unitType', key: 'unitType' },
    {
      title: 'Entitlement',
      key: 'entitlement',
      render: (_value, row) => `${formatNumber(row.freeEntitlementAmount)} / ${row.renewalInterval}`,
    },
    {
      title: 'Test Flow',
      key: 'testFlow',
      render: (_value, row) => (
        <Space wrap size={[6, 6]}>
          <Tag color={row.testEnabled ? 'success' : 'default'}>
            {row.testEnabled ? 'Enabled' : 'Disabled'}
          </Tag>
          {row.testTaskType ? <Tag>{row.testTaskType}</Tag> : null}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      render: (_value, row) => (
        <Button icon={<EditOutlined />} onClick={() => openPlanModal(row)}>
          Edit
        </Button>
      ),
    },
  ];

  const accountColumns: TableProps<ExternalProviderAccountAdminDto>['columns'] = [
    { title: 'Account', dataIndex: 'accountName', key: 'accountName' },
    { title: 'Provider', dataIndex: 'provider', key: 'provider', render: (value: string) => <Tag>{value}</Tag> },
    { title: 'Plan', dataIndex: 'planProfileName', key: 'planProfileName', render: (value: string | null) => value ?? '—' },
    { title: 'Type', dataIndex: 'accountType', key: 'accountType' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <Tag color={statusTagColor(value)}>{value}</Tag>,
    },
    {
      title: 'Remaining',
      key: 'remaining',
      render: (_value, row) => formatNumber(row.latestSnapshot?.remainingUnits ?? null),
    },
    {
      title: 'Projection',
      key: 'projection',
      render: (_value, row) => (
        <Space direction="vertical" size={0}>
          <Text>{formatPercent(row.latestSnapshot?.usagePercent ?? null)}</Text>
          <Text type="secondary">{formatDateTime(row.latestSnapshot?.projectedExhaustionAt ?? null)}</Text>
        </Space>
      ),
    },
    {
      title: 'Paid risk',
      key: 'paidRisk',
      render: (_value, row) => formatCurrency(row.latestSnapshot?.projectedPeriodCostUsd ?? null),
    },
    {
      title: '',
      key: 'actions',
      render: (_value, row) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openAccountModal(row)} />
          <Popconfirm
            title="Delete this provider account?"
            onConfirm={() => ctx && api.deleteAdminExternalProviderAccount(ctx, row.id).then(loadAll)}
          >
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const keyColumns: TableProps<ExternalProviderApiKeyAdminDto>['columns'] = [
    { title: 'Key', dataIndex: 'keyName', key: 'keyName' },
    {
      title: 'Mask',
      dataIndex: 'maskedKeyPreview',
      key: 'maskedKeyPreview',
      render: (value: string | null) => value ?? 'stored-secret',
    },
    { title: 'Provider', dataIndex: 'provider', key: 'provider', render: (value: string) => <Tag>{value}</Tag> },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <Tag color={statusTagColor(value)}>{value}</Tag>,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (value: number) => formatNumber(value),
    },
    {
      title: 'Usage',
      key: 'usage',
      render: (_value, row) => (
        <Space direction="vertical" size={0}>
          <Text>{formatNumber(row.unitsUsedMonth)} units / month</Text>
          <Text type="secondary">{formatNumber(row.requestsUsedMonth)} requests</Text>
        </Space>
      ),
    },
    {
      title: 'Reset',
      key: 'reset',
      render: (_value, row) => (
        <Space direction="vertical" size={0}>
          <Text>{formatDateTime(row.resetWeeklyAt ?? row.resetMonthlyAt ?? row.resetDailyAt)}</Text>
          <Text type="secondary">{row.cooldownUntil ? `Cooldown until ${formatDateTime(row.cooldownUntil)}` : 'Ready'}</Text>
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      render: (_value, row) => (
        <Space>
          <Button
            icon={<ExperimentOutlined />}
            loading={busyAction === `test-key-${row.id}`}
            onClick={() => void runKeyTest(row)}
          >
            Test
          </Button>
          <Button icon={<EditOutlined />} onClick={() => openKeyModal(row)} />
          <Popconfirm
            title="Delete this API key?"
            onConfirm={() => ctx && api.deleteAdminExternalProviderKey(ctx, row.id).then(loadAll)}
          >
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const routeColumns: TableProps<ExternalProviderRouteAdminDto>['columns'] = [
    { title: 'Task type', dataIndex: 'taskType', key: 'taskType' },
    {
      title: 'Attempts',
      key: 'attempts',
      render: (_value, row) => (
        <Space wrap size={[6, 6]}>
          <Tag color="processing">{row.primaryProvider}</Tag>
          {row.fallbackProvider ? <Tag>{row.fallbackProvider}</Tag> : null}
          {row.fallback2Provider ? <Tag>{row.fallback2Provider}</Tag> : null}
          {row.fallback3Provider ? <Tag>{row.fallback3Provider}</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Mode',
      key: 'mode',
      render: (_value, row) => (
        <Space wrap size={[6, 6]}>
          <Tag color={row.isActive ? 'success' : 'default'}>{row.isActive ? 'Active' : 'Disabled'}</Tag>
          {row.allowManualFallback ? <Tag color="warning">Manual fallback</Tag> : null}
          {row.requiresBrowser ? <Tag>Browser</Tag> : null}
          {row.requiresJson ? <Tag>JSON</Tag> : <Tag>Raw</Tag>}
        </Space>
      ),
    },
    {
      title: 'Retries',
      key: 'retries',
      render: (_value, row) => `${row.maxAttempts} / ${row.timeoutMs ?? 0}ms`,
    },
    {
      title: '',
      key: 'actions',
      render: (_value, row) => (
        <Button icon={<EditOutlined />} onClick={() => openRouteModal(row)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Flex vertical gap={24}>
      <PageHeader
        title="External Provider Free-Tier & Cost Intelligence"
        subtitle="Operate the Provider Capacity Pool, test approved keys, track free-tier burn, and stay ahead of paid overage."
        extra={
          <Space wrap>
            <Button
              onClick={() =>
                void runAction('recalculate', async () => {
                  await api.recalculateAdminExternalProviderUsage(ctx, {});
                  await loadAll();
                  message.success('Usage snapshots recalculated');
                })
              }
              loading={busyAction === 'recalculate'}
            >
              Recalculate
            </Button>
            <Button
              onClick={() =>
                void runAction('sync-usage', async () => {
                  await api.syncAdminExternalProviderUsage(ctx);
                  await loadAll();
                  message.success('Provider usage sync triggered');
                })
              }
              loading={busyAction === 'sync-usage'}
            >
              Sync Usage
            </Button>
            <Button
              onClick={() =>
                void runAction('reset-check', async () => {
                  await api.resetCheckAdminExternalProviderUsage(ctx);
                  await loadAll();
                  message.success('Reset check triggered');
                })
              }
              loading={busyAction === 'reset-check'}
            >
              Reset Check
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadAll()} loading={loading}>
              Refresh
            </Button>
          </Space>
        }
      />

      <Flex gap={16} wrap>
        <MetricCard eyebrow="Plan Profiles" value={plans.length.toLocaleString()} loading={loading} />
        <MetricCard eyebrow="Approved Keys" value={keys.length.toLocaleString()} loading={loading} />
        <MetricCard eyebrow="Remaining Free Units" value={formatNumber(totalRemainingUnits)} loading={loading} />
        <MetricCard eyebrow="Projected Paid Risk" value={formatCurrency(forecast?.projections.projectedPaidCostUsd)} loading={loading} />
        <MetricCard eyebrow="New Alerts" value={newAlertsCount.toLocaleString()} loading={loading} />
        <MetricCard eyebrow="Rate Limits" value={formatNumber(usage?.totals.rateLimitEvents)} loading={loading} />
      </Flex>

      <Card variant="borderless">
        {loading && plans.length === 0 ? (
          <Skeleton active paragraph={{ rows: 10 }} />
        ) : (
          <Tabs
            items={[
              {
                key: 'overview',
                label: 'Overview',
                children: (
                  <Flex vertical gap={20}>
                    <Card size="small">
                      <Flex gap={24} wrap>
                        <div>
                          <Text type="secondary">Current period</Text>
                          <div>{usage?.period ?? '—'}</div>
                        </div>
                        <div>
                          <Text type="secondary">Projected exhaustion</Text>
                          <div>{formatDateTime(forecast?.projections.projectedExhaustionAt)}</div>
                        </div>
                        <div>
                          <Text type="secondary">Free credits used</Text>
                          <div>{formatNumber(forecast?.savings.freeCreditsUsed)}</div>
                        </div>
                        <div>
                          <Text type="secondary">Estimated cost avoided</Text>
                          <div>{formatCurrency(forecast?.savings.estimatedCostAvoidedUsd)}</div>
                        </div>
                        <div>
                          <Text type="secondary">Cost per qualified lead</Text>
                          <div>{formatCurrency(forecast?.businessEfficiency.costPerQualifiedLead)}</div>
                        </div>
                      </Flex>
                    </Card>
                    <Table rowKey="id" columns={accountColumns} dataSource={accounts} pagination={false} />
                  </Flex>
                ),
              },
              {
                key: 'plans',
                label: `Plans (${plans.length})`,
                children: (
                  <>
                    <Flex justify="flex-end" style={{ marginBottom: 12 }}>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => openPlanModal()}>
                        Add plan profile
                      </Button>
                    </Flex>
                    <Table
                      rowKey="id"
                      columns={planColumns}
                      dataSource={plans}
                      pagination={false}
                      locale={{ emptyText: <EmptyState description="No external provider plans are configured." /> }}
                    />
                  </>
                ),
              },
              {
                key: 'accounts',
                label: `Accounts (${accounts.length})`,
                children: (
                  <>
                    <Flex justify="flex-end" style={{ marginBottom: 12 }}>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => openAccountModal()}>
                        Add provider account
                      </Button>
                    </Flex>
                    <Table rowKey="id" columns={accountColumns} dataSource={accounts} pagination={false} />
                  </>
                ),
              },
              {
                key: 'keys',
                label: `Keys (${keys.length})`,
                children: (
                  <>
                    <Flex justify="flex-end" style={{ marginBottom: 12 }}>
                      <Button type="primary" icon={<PlusOutlined />} disabled={accounts.length === 0} onClick={() => openKeyModal()}>
                        Add API key
                      </Button>
                    </Flex>
                    <Table rowKey="id" columns={keyColumns} dataSource={keys} pagination={false} />
                  </>
                ),
              },
              {
                key: 'routes',
                label: `Routes (${routes.length})`,
                children: (
                  <>
                    <Flex justify="flex-end" style={{ marginBottom: 12 }}>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => openRouteModal()}>
                        Add route
                      </Button>
                    </Flex>
                    <Table rowKey="id" columns={routeColumns} dataSource={routes} pagination={false} />
                  </>
                ),
              },
              {
                key: 'usage',
                label: 'Usage',
                children: (
                  <Flex vertical gap={20}>
                    <Card size="small">
                      <Flex gap={24} wrap>
                        <div>
                          <Text type="secondary">Requests</Text>
                          <div>{formatNumber(usage?.totals.requests)}</div>
                        </div>
                        <div>
                          <Text type="secondary">Paid cost</Text>
                          <div>{formatCurrency(usage?.totals.paidCostUsd)}</div>
                        </div>
                        <div>
                          <Text type="secondary">Fallback count</Text>
                          <div>{formatNumber(usage?.totals.fallbackCount)}</div>
                        </div>
                        <div>
                          <Text type="secondary">Last 24h usage</Text>
                          <div>{formatNumber(forecast?.velocity.last24hUsage)}</div>
                        </div>
                      </Flex>
                    </Card>
                    <Table
                      rowKey={(row) => `${row.provider}-${row.taskType ?? 'all'}-${row.lastSeenAt ?? 'na'}`}
                      dataSource={usage?.byTask ?? []}
                      pagination={false}
                      columns={[
                        { title: 'Provider', dataIndex: 'provider', key: 'provider' },
                        { title: 'Task', dataIndex: 'taskType', key: 'taskType', render: (value: string | null) => value ?? 'All' },
                        { title: 'Units', dataIndex: 'usedUnits', key: 'usedUnits', render: formatNumber },
                        { title: 'Paid units', dataIndex: 'paidUnitsApplied', key: 'paidUnitsApplied', render: formatNumber },
                        { title: 'Paid cost', dataIndex: 'paidCostUsd', key: 'paidCostUsd', render: formatCurrency },
                        { title: 'Failed', dataIndex: 'failedCalls', key: 'failedCalls', render: formatNumber },
                        { title: 'Cache skips', dataIndex: 'skippedCacheCount', key: 'skippedCacheCount', render: formatNumber },
                      ]}
                    />
                    <Table
                      rowKey="id"
                      dataSource={snapshots}
                      pagination={{ pageSize: 8 }}
                      columns={[
                        { title: 'Provider', dataIndex: 'provider', key: 'provider' },
                        { title: 'Period', key: 'period', render: (_value, row) => `${row.periodType} · ${row.periodStart.slice(0, 10)}` },
                        { title: 'Used', dataIndex: 'usedUnits', key: 'usedUnits', render: formatNumber },
                        { title: 'Remaining', dataIndex: 'remainingUnits', key: 'remainingUnits', render: formatNumber },
                        { title: 'Usage', dataIndex: 'usagePercent', key: 'usagePercent', render: formatPercent },
                        { title: 'Projected exhaustion', dataIndex: 'projectedExhaustionAt', key: 'projectedExhaustionAt', render: formatDateTime },
                        { title: 'Projected paid cost', dataIndex: 'projectedPeriodCostUsd', key: 'projectedPeriodCostUsd', render: formatCurrency },
                      ]}
                    />
                    <Table
                      rowKey="id"
                      dataSource={events}
                      pagination={{ pageSize: 8 }}
                      expandable={{
                        expandedRowRender: (row) => (
                          <Flex gap={16} wrap style={{ padding: '8px 0' }}>
                            {row.endpointKey && <div><Typography.Text type="secondary">Endpoint</Typography.Text><div>{row.endpointKey}</div></div>}
                            {row.datasetKey && <div><Typography.Text type="secondary">Dataset</Typography.Text><div>{row.datasetKey}</div></div>}
                            <div><Typography.Text type="secondary">Base units</Typography.Text><div>{formatNumber(row.baseUnits ?? 0)}</div></div>
                            <div><Typography.Text type="secondary">Multiplier</Typography.Text><div>{row.multiplierTotal ?? 1}×</div></div>
                            <div><Typography.Text type="secondary">Final units</Typography.Text><div>{formatNumber(row.finalUnits ?? 0)}</div></div>
                            <div><Typography.Text type="secondary">Free units</Typography.Text><div>{formatNumber(row.freeUnitsApplied ?? 0)}</div></div>
                            <div><Typography.Text type="secondary">Paid units</Typography.Text><div>{formatNumber(row.paidUnitsApplied ?? 0)}</div></div>
                            <div><Typography.Text type="secondary">Unit price</Typography.Text><div>{formatCurrency(row.unitPriceUsd ?? 0)}</div></div>
                            <div><Typography.Text type="secondary">Calculated cost</Typography.Text><div>{formatCurrency(row.calculatedCostUsd ?? 0)}</div></div>
                            {row.providerReportedCostUsd != null && <div><Typography.Text type="secondary">Provider reported</Typography.Text><div>{formatCurrency(row.providerReportedCostUsd)}</div></div>}
                            {row.costSource && <div><Typography.Text type="secondary">Cost source</Typography.Text><Tag>{row.costSource}</Tag></div>}
                            {row.successfulRecordCount != null && row.successfulRecordCount > 0 && <div><Typography.Text type="secondary">Successful records</Typography.Text><div>{formatNumber(row.successfulRecordCount)}</div></div>}
                            {row.failedRecordCount != null && row.failedRecordCount > 0 && <div><Typography.Text type="secondary">Failed records</Typography.Text><div>{formatNumber(row.failedRecordCount)}</div></div>}
                            {row.costBreakdownJson && Object.keys(row.costBreakdownJson).length > 0 && (
                              <div style={{ width: '100%' }}>
                                <Typography.Text type="secondary">Cost breakdown JSON</Typography.Text>
                                <Input.TextArea readOnly value={formatJson(row.costBreakdownJson)} autoSize={{ minRows: 3, maxRows: 10 }} style={{ fontFamily: 'monospace', fontSize: 11, marginTop: 4 }} />
                              </div>
                            )}
                          </Flex>
                        ),
                      }}
                      columns={[
                        { title: 'Provider', dataIndex: 'provider', key: 'provider' },
                        { title: 'Task', dataIndex: 'taskType', key: 'taskType' },
                        { title: 'Status', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={statusTagColor(value)}>{value}</Tag> },
                        { title: 'Units', dataIndex: 'usedUnits', key: 'usedUnits', render: formatNumber },
                        { title: 'Paid cost', dataIndex: 'paidCostUsd', key: 'paidCostUsd', render: formatCurrency },
                        { title: 'Cost source', dataIndex: 'costSource', key: 'costSource', render: (v: string | null) => v ? <Tag>{v}</Tag> : '—' },
                        { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', render: formatDateTime },
                      ]}
                    />
                  </Flex>
                ),
              },
              {
                key: 'alerts',
                label: `Alerts (${alerts.events.length})`,
                children: (
                  <Flex vertical gap={20}>
                    <Table
                      rowKey="id"
                      dataSource={alerts.events}
                      pagination={{ pageSize: 8 }}
                      columns={[
                        { title: 'Provider', dataIndex: 'provider', key: 'provider' },
                        { title: 'Type', dataIndex: 'alertType', key: 'alertType' },
                        {
                          title: 'Status',
                          dataIndex: 'status',
                          key: 'status',
                          render: (value: string) => <Tag color={statusTagColor(value)}>{value}</Tag>,
                        },
                        { title: 'Threshold', dataIndex: 'thresholdPercent', key: 'thresholdPercent', render: formatPercent },
                        { title: 'Message', dataIndex: 'message', key: 'message' },
                        { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', render: formatDateTime },
                        {
                          title: '',
                          key: 'actions',
                          render: (_value, row) =>
                            row.status === 'new' ? (
                              <Button
                                size="small"
                                onClick={() =>
                                  void runAction(`ack-alert-${row.id}`, async () => {
                                    await api.acknowledgeAdminExternalProviderAlert(ctx, row.id);
                                    await loadAll();
                                  })
                                }
                              >
                                Acknowledge
                              </Button>
                            ) : null,
                        },
                      ]}
                    />
                    <Table
                      rowKey="id"
                      dataSource={alerts.rules}
                      pagination={false}
                      columns={[
                        { title: 'Provider', dataIndex: 'provider', key: 'provider', render: (value: string | null) => value ?? 'Global' },
                        { title: 'Alert', dataIndex: 'alertType', key: 'alertType' },
                        { title: 'Threshold', dataIndex: 'thresholdPercent', key: 'thresholdPercent', render: formatPercent },
                        {
                          title: 'Recipients',
                          key: 'recipients',
                          render: (_value, row) => (
                            <Space wrap size={[6, 6]}>
                              {row.notifyMasterAdmin ? <Tag color="processing">Master Admin</Tag> : null}
                              {row.notifyCompanyAdmin ? <Tag>Company Admin</Tag> : null}
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </Flex>
                ),
              },
              {
                key: 'health',
                label: `Health (${health.length})`,
                children: (
                  <Table
                    rowKey="id"
                    dataSource={health}
                    pagination={{ pageSize: 10 }}
                    columns={[
                      { title: 'Provider', dataIndex: 'provider', key: 'provider' },
                      { title: 'API key', dataIndex: 'apiKeyId', key: 'apiKeyId', render: (value: string | null) => value ?? '—' },
                      { title: 'Status', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={statusTagColor(value)}>{value}</Tag> },
                      { title: 'Latency (ms)', dataIndex: 'latencyMs', key: 'latencyMs', render: formatNumber },
                      { title: 'Checked', dataIndex: 'checkedAt', key: 'checkedAt', render: formatDateTime },
                    ]}
                  />
                ),
              },
              {
                key: 'tests',
                label: `Tests (${testRuns.length})`,
                children: (
                  <Table
                    rowKey="id"
                    dataSource={testRuns}
                    pagination={{ pageSize: 8 }}
                    columns={[
                      { title: 'Provider', dataIndex: 'provider', key: 'provider' },
                      { title: 'Task', dataIndex: 'taskType', key: 'taskType' },
                      { title: 'Status', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={statusTagColor(value)}>{value}</Tag> },
                      { title: 'Units', dataIndex: 'estimatedUnitsUsed', key: 'estimatedUnitsUsed', render: formatNumber },
                      { title: 'Cost', dataIndex: 'estimatedCostUsd', key: 'estimatedCostUsd', render: formatCurrency },
                      { title: 'Latency', dataIndex: 'latencyMs', key: 'latencyMs', render: (value: number | null) => (value == null ? '—' : `${value}ms`) },
                      { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', render: formatDateTime },
                    ]}
                  />
                ),
              },
              {
                key: 'reconciliation',
                label: `Reconciliation (${reconciliations.length})`,
                children: (
                  <Table
                    rowKey="id"
                    dataSource={reconciliations}
                    pagination={{ pageSize: 8 }}
                    columns={[
                      { title: 'Provider', dataIndex: 'provider', key: 'provider' },
                      { title: 'Internal units', dataIndex: 'internalUsedUnits', key: 'internalUsedUnits', render: formatNumber },
                      { title: 'Provider units', dataIndex: 'providerReportedUnits', key: 'providerReportedUnits', render: formatNumber },
                      { title: 'Variance', dataIndex: 'variancePercent', key: 'variancePercent', render: formatPercent },
                      { title: 'Status', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={statusTagColor(value)}>{value}</Tag> },
                      { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', render: formatDateTime },
                    ]}
                  />
                ),
              },
              {
                key: 'cost-rules',
                label: `Cost Rules (${costRules.length})`,
                children: (
                  <Flex vertical gap={16}>
                    <Flex justify="space-between" align="center">
                      <Typography.Text type="secondary">
                        Define per-provider, per-task, per-endpoint cost rules. Higher priority number = lower specificity.
                      </Typography.Text>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCostRuleEditing(null); costRuleForm.resetFields(); setCostRuleModalOpen(true); }}>
                        Add cost rule
                      </Button>
                    </Flex>
                    <Table
                      rowKey="id"
                      dataSource={costRules}
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: 'Provider', dataIndex: 'provider', key: 'provider' },
                        { title: 'Rule name', dataIndex: 'ruleName', key: 'ruleName' },
                        { title: 'Scope', dataIndex: 'ruleScope', key: 'ruleScope', render: (v: string) => <Tag>{v}</Tag> },
                        { title: 'Task type', dataIndex: 'taskType', key: 'taskType', render: (v: string | null) => v ?? '—' },
                        { title: 'Dataset / Actor', key: 'dataset', render: (_v: unknown, row: ExternalCostRuleAdminDto) => row.datasetKey ?? row.actorKey ?? '—' },
                        { title: 'Unit type', dataIndex: 'unitType', key: 'unitType', render: (v: string) => <Tag color="blue">{v}</Tag> },
                        { title: 'Billing', dataIndex: 'billingEvent', key: 'billingEvent' },
                        {
                          title: 'Units',
                          key: 'units',
                          render: (_v: unknown, row: ExternalCostRuleAdminDto) => {
                            const nonZero = [
                              row.unitsPerSuccessfulRecord > 0 && `${row.unitsPerSuccessfulRecord}/success_record`,
                              row.unitsPerRecord > 0 && `${row.unitsPerRecord}/record`,
                              row.unitsPerPage > 0 && `${row.unitsPerPage}/page`,
                              row.unitsPerRequest > 0 && `${row.unitsPerRequest}/request`,
                              row.unitsPerResult > 0 && `${row.unitsPerResult}/result`,
                              row.unitsPerSearch > 0 && `${row.unitsPerSearch}/search`,
                            ].filter(Boolean);
                            return nonZero.length ? nonZero.join(', ') : '—';
                          },
                        },
                        { title: 'Price USD', dataIndex: 'unitPriceUsd', key: 'unitPriceUsd', render: (v: number) => v > 0 ? `$${v}` : '—' },
                        { title: 'Priority', dataIndex: 'priority', key: 'priority' },
                        { title: 'Active', dataIndex: 'isActive', key: 'isActive', render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? 'Yes' : 'No'}</Tag> },
                        {
                          title: '',
                          key: 'actions',
                          render: (_v: unknown, row: ExternalCostRuleAdminDto) => (
                            <Space size={4}>
                              <Button size="small" icon={<EditOutlined />} onClick={() => {
                                setCostRuleEditing(row);
                                costRuleForm.setFieldsValue({
                                  ...row,
                                  formulaJson: formatJson(row.formulaJson),
                                  conditionsJson: formatJson(row.conditionsJson),
                                });
                                setCostRuleModalOpen(true);
                              }} />
                              <Popconfirm title="Delete this cost rule?" onConfirm={async () => {
                                await runAction(`delete-cost-rule-${row.id}`, async () => {
                                  await api.deleteAdminExternalCostRule(ctx, row.id);
                                  await loadAll();
                                });
                              }}>
                                <Button size="small" danger icon={<DeleteOutlined />} loading={busyAction === `delete-cost-rule-${row.id}`} />
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                      locale={{ emptyText: <EmptyState description="No cost rules configured. Add a rule to define per-task costs." /> }}
                    />
                  </Flex>
                ),
              },
              {
                key: 'endpoints',
                label: `Endpoints (${endpointCatalog.length})`,
                children: (
                  <Flex vertical gap={16}>
                    <Flex justify="space-between" align="center">
                      <Typography.Text type="secondary">
                        Catalog of provider endpoints, datasets, and actors. Links endpoints to cost rules.
                      </Typography.Text>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => { endpointForm.resetFields(); setEndpointModalOpen(true); }}>
                        Add endpoint
                      </Button>
                    </Flex>
                    <Table
                      rowKey="id"
                      dataSource={endpointCatalog}
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: 'Provider', dataIndex: 'provider', key: 'provider' },
                        { title: 'Endpoint key', dataIndex: 'endpointKey', key: 'endpointKey', render: (v: string) => <Typography.Text code copyable>{v}</Typography.Text> },
                        { title: 'Display name', dataIndex: 'displayName', key: 'displayName' },
                        { title: 'Task types', dataIndex: 'taskTypes', key: 'taskTypes', render: (v: string[]) => (v ?? []).map((t) => <Tag key={t}>{t}</Tag>) },
                        { title: 'Dataset', dataIndex: 'datasetKey', key: 'datasetKey', render: (v: string | null) => v ?? '—' },
                        { title: 'Actor', dataIndex: 'actorKey', key: 'actorKey', render: (v: string | null) => v ?? '—' },
                        { title: 'Unit type', dataIndex: 'defaultUnitType', key: 'defaultUnitType', render: (v: string | null) => v ? <Tag color="blue">{v}</Tag> : '—' },
                        { title: 'Notes', dataIndex: 'notes', key: 'notes', render: (v: string | null) => v ?? '—' },
                        { title: 'Active', dataIndex: 'isActive', key: 'isActive', render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? 'Yes' : 'No'}</Tag> },
                        {
                          title: '',
                          key: 'actions',
                          render: (_v: unknown, row: ExternalEndpointCatalogAdminDto) => (
                            <Popconfirm title="Delete this endpoint?" onConfirm={async () => {
                              await runAction(`delete-endpoint-${row.id}`, async () => {
                                await api.deleteAdminExternalEndpoint(ctx, row.id);
                                await loadAll();
                              });
                            }}>
                              <Button size="small" danger icon={<DeleteOutlined />} loading={busyAction === `delete-endpoint-${row.id}`} />
                            </Popconfirm>
                          ),
                        },
                      ]}
                      locale={{ emptyText: <EmptyState description="No endpoints cataloged." /> }}
                    />
                  </Flex>
                ),
              },
              {
                key: 'multipliers',
                label: `Multipliers (${optionMultipliers.length})`,
                children: (
                  <Flex vertical gap={16}>
                    <Flex justify="space-between" align="center">
                      <Typography.Text type="secondary">
                        Request option multipliers applied when specific options are set (e.g. render_js=true → 10× credits).
                      </Typography.Text>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => { optionMultiplierForm.resetFields(); setOptionMultiplierModalOpen(true); }}>
                        Add multiplier
                      </Button>
                    </Flex>
                    <Table
                      rowKey="id"
                      dataSource={optionMultipliers}
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: 'Provider', dataIndex: 'provider', key: 'provider' },
                        { title: 'Option key', dataIndex: 'optionKey', key: 'optionKey', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
                        { title: 'Value match', dataIndex: 'optionValue', key: 'optionValue', render: (v: string | null) => v ?? '(any truthy)' },
                        { title: 'Multiplier', dataIndex: 'multiplier', key: 'multiplier', render: (v: number) => <Tag color="orange">{v}×</Tag> },
                        { title: 'Additional units', dataIndex: 'additionalUnits', key: 'additionalUnits', render: (v: number) => v > 0 ? `+${v}` : '—' },
                        { title: 'Additional cost USD', dataIndex: 'additionalCostUsd', key: 'additionalCostUsd', render: (v: number) => v > 0 ? `+$${v}` : '—' },
                        { title: 'Applies to tasks', dataIndex: 'appliesToTaskTypes', key: 'appliesToTaskTypes', render: (v: string[]) => (v ?? []).length ? (v ?? []).map((t) => <Tag key={t}>{t}</Tag>) : <Tag>All</Tag> },
                        { title: 'Active', dataIndex: 'isActive', key: 'isActive', render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? 'Yes' : 'No'}</Tag> },
                        {
                          title: '',
                          key: 'actions',
                          render: (_v: unknown, row: ExternalOptionMultiplierAdminDto) => (
                            <Popconfirm title="Delete this multiplier?" onConfirm={async () => {
                              await runAction(`delete-multiplier-${row.id}`, async () => {
                                await api.deleteAdminExternalOptionMultiplier(ctx, row.id);
                                await loadAll();
                              });
                            }}>
                              <Button size="small" danger icon={<DeleteOutlined />} loading={busyAction === `delete-multiplier-${row.id}`} />
                            </Popconfirm>
                          ),
                        },
                      ]}
                      locale={{ emptyText: <EmptyState description="No option multipliers configured." /> }}
                    />
                  </Flex>
                ),
              },
              {
                key: 'simulator',
                label: 'Cost Simulator',
                children: (
                  <Flex vertical gap={24}>
                    <Typography.Text type="secondary">
                      Simulate the cost of a provider call before it runs. Fills in estimated units, free-tier split, and router decision.
                    </Typography.Text>
                    <Card size="small" title="Simulator inputs">
                      <Form form={simulatorForm} layout="vertical" onFinish={(values) => void runSimulator(values)}>
                        <Flex gap={16} wrap>
                          <Form.Item name="provider" label="Provider" style={{ width: 200 }} rules={[{ required: true }]}>
                            <Select options={EXTERNAL_PROVIDERS.map((p) => ({ label: p, value: p }))} placeholder="Select provider" />
                          </Form.Item>
                          <Form.Item name="taskType" label="Task type" style={{ width: 240 }} rules={[{ required: true }]}>
                            <Select options={EXTERNAL_PROVIDER_TASK_TYPES.map((t) => ({ label: t, value: t }))} placeholder="Select task type" showSearch />
                          </Form.Item>
                          <Form.Item name="endpointKey" label="Endpoint key" style={{ width: 260 }}>
                            <Select options={endpointCatalog.map((e) => ({ label: e.displayName, value: e.endpointKey }))} placeholder="Optional" allowClear showSearch />
                          </Form.Item>
                          <Form.Item name="expectedRequests" label="Expected requests" style={{ width: 160 }}>
                            <InputNumber min={1} defaultValue={1} style={{ width: '100%' }} />
                          </Form.Item>
                          <Form.Item name="expectedRecords" label="Expected records" style={{ width: 160 }}>
                            <InputNumber min={0} defaultValue={0} style={{ width: '100%' }} />
                          </Form.Item>
                          <Form.Item name="expectedSuccessfulRecords" label="Expected successful records" style={{ width: 200 }}>
                            <InputNumber min={0} defaultValue={0} style={{ width: '100%' }} />
                          </Form.Item>
                          <Form.Item name="expectedPages" label="Expected pages" style={{ width: 160 }}>
                            <InputNumber min={0} defaultValue={0} style={{ width: '100%' }} />
                          </Form.Item>
                          <Form.Item name="apiKeyId" label="API key (for free-tier check)" style={{ width: 260 }}>
                            <Select options={keys.map((k) => ({ label: k.keyName, value: k.id }))} placeholder="Optional" allowClear showSearch />
                          </Form.Item>
                        </Flex>
                        <Form.Item>
                          <Button type="primary" htmlType="submit" icon={<ReloadOutlined />} loading={simulatorLoading}>
                            Run simulator
                          </Button>
                        </Form.Item>
                      </Form>
                    </Card>

                    {simulatorResult && (
                      <Card size="small" title="Simulator result">
                        <Flex gap={24} wrap style={{ marginBottom: 16 }}>
                          <div>
                            <Typography.Text type="secondary">Cost rule</Typography.Text>
                            <div>{simulatorResult.costRule?.ruleName ?? 'Default/plan fallback'}</div>
                          </div>
                          <div>
                            <Typography.Text type="secondary">Estimated units</Typography.Text>
                            <div>{formatNumber(simulatorResult.estimatedUnits)}</div>
                          </div>
                          <div>
                            <Typography.Text type="secondary">Free units before</Typography.Text>
                            <div>{formatNumber(simulatorResult.freeUnitsRemainingBefore)}</div>
                          </div>
                          <div>
                            <Typography.Text type="secondary">Free units applied</Typography.Text>
                            <div>{formatNumber(simulatorResult.freeUnitsApplied)}</div>
                          </div>
                          <div>
                            <Typography.Text type="secondary">Paid units</Typography.Text>
                            <div>{formatNumber(simulatorResult.paidUnitsApplied)}</div>
                          </div>
                          <div>
                            <Typography.Text type="secondary">Multiplier total</Typography.Text>
                            <div>{simulatorResult.multiplierTotal}×</div>
                          </div>
                          <div>
                            <Typography.Text type="secondary">Unit price</Typography.Text>
                            <div>{formatCurrency(simulatorResult.unitPriceUsd)}</div>
                          </div>
                          <div>
                            <Typography.Text type="secondary">Estimated paid cost</Typography.Text>
                            <div style={{ fontWeight: 600 }}>{formatCurrency(simulatorResult.estimatedPaidCostUsd)}</div>
                          </div>
                          <div>
                            <Typography.Text type="secondary">Router decision</Typography.Text>
                            <Tag color={simulatorResult.routerDecision === 'allow' ? 'success' : 'warning'}>{simulatorResult.routerDecision}</Tag>
                          </div>
                        </Flex>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Router reason: {simulatorResult.routerReason}</Typography.Text>
                        {simulatorResult.optionMultipliers.length > 0 && (
                          <>
                            <Typography.Text strong style={{ display: 'block', marginTop: 12, marginBottom: 6 }}>Option multipliers applied</Typography.Text>
                            <Space wrap>
                              {simulatorResult.optionMultipliers.map((m) => (
                                <Tag key={m.id} color="orange">{m.optionKey} → {m.multiplier}×</Tag>
                              ))}
                            </Space>
                          </>
                        )}
                        <Typography.Text strong style={{ display: 'block', marginTop: 16, marginBottom: 6 }}>Full cost breakdown (JSON)</Typography.Text>
                        <Input.TextArea
                          readOnly
                          value={formatJson(simulatorResult.breakdown)}
                          autoSize={{ minRows: 6, maxRows: 20 }}
                          style={{ fontFamily: 'monospace', fontSize: 12 }}
                        />
                      </Card>
                    )}
                  </Flex>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        title={planEditing ? 'Edit plan profile' : 'Add plan profile'}
        open={planModalOpen}
        onCancel={() => setPlanModalOpen(false)}
        footer={null}
        width={860}
        destroyOnHidden
      >
        <Form form={planForm} layout="vertical" onFinish={(values) => void submitPlan(values)}>
          <Flex gap={12}>
            <Form.Item name="provider" label="Provider" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={EXTERNAL_PROVIDERS.map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item name="planName" label="Plan name" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Flex>
          <Flex gap={12}>
            <Form.Item name="planType" label="Plan type" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={EXTERNAL_PROVIDER_PLAN_TYPES.map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item name="unitType" label="Unit type" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={EXTERNAL_PROVIDER_UNIT_TYPES.map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item name="renewalInterval" label="Renewal interval" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={EXTERNAL_PROVIDER_RENEWAL_INTERVALS.map((value) => ({ value, label: value }))} />
            </Form.Item>
          </Flex>
          <Flex gap={12}>
            <Form.Item name="freeEntitlementAmount" label="Free entitlement" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="includedUnits" label="Included units" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="overageUnitPrice" label="Overage unit price" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Flex gap={12}>
            <Form.Item name="renewalTimezone" label="Renewal timezone" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="renewalAnchorDay" label="Renewal anchor day" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="currency" label="Currency" style={{ flex: 1 }}>
              <Input placeholder="USD" />
            </Form.Item>
          </Flex>
          <Flex gap={12}>
            <Form.Item name="testTaskType" label="Test task type" style={{ flex: 1 }}>
              <Select allowClear options={EXTERNAL_PROVIDER_TASK_TYPES.map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item name="providerDashboardUrl" label="Provider dashboard URL" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Flex>
          <Flex gap={12}>
            <Form.Item name="overageEnabled" label="Overage enabled" valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
            <Form.Item name="testEnabled" label="Test flow enabled" valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
            <Form.Item name="testConsumesCredits" label="Test consumes credits" valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
            <Form.Item name="isActive" label="Active" valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
          </Flex>
          <Form.Item name="costRules" label="Cost rules JSON">
            <Input.TextArea rows={6} spellCheck={false} />
          </Form.Item>
          <Form.Item name="testPayloadJson" label="Test payload JSON">
            <Input.TextArea rows={4} spellCheck={false} />
          </Form.Item>
          <Form.Item name="expectedResponseShapeJson" label="Expected response shape JSON">
            <Input.TextArea rows={4} spellCheck={false} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={busyAction === 'plan-submit'}>
            Save plan profile
          </Button>
        </Form>
      </Modal>

      <Modal
        title={accountEditing ? 'Edit provider account' : 'Add provider account'}
        open={accountModalOpen}
        onCancel={() => setAccountModalOpen(false)}
        footer={null}
        width={720}
        destroyOnHidden
      >
        <Form form={accountForm} layout="vertical" onFinish={(values) => void submitAccount(values)}>
          <Flex gap={12}>
            <Form.Item name="provider" label="Provider" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={EXTERNAL_PROVIDERS.map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item name="accountName" label="Account name" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Flex>
          <Flex gap={12}>
            <Form.Item name="accountType" label="Account type" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={EXTERNAL_PROVIDER_ACCOUNT_TYPES.map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item name="status" label="Status" style={{ flex: 1 }}>
              <Select allowClear options={EXTERNAL_PROVIDER_ACCOUNT_STATUSES.map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item name="planProfileId" label="Plan profile" style={{ flex: 1 }}>
              <Select
                allowClear
                options={plans.map((plan) => ({
                  value: plan.id,
                  label: `${plan.provider} · ${plan.planName}`,
                }))}
              />
            </Form.Item>
          </Flex>
          <Flex gap={12}>
            <Form.Item name="weeklyBudget" label="Weekly budget" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="monthlyBudget" label="Monthly budget" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="totalBudget" label="Total budget" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Flex gap={12}>
            <Form.Item name="rateLimitRpm" label="RPM limit" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="rateLimitTpm" label="TPM limit" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Form.Item name="allowedOrganizationIds" label="Allowed organizations">
            <Select mode="tags" tokenSeparators={[',']} />
          </Form.Item>
          <Form.Item name="baseUrl" label="Base URL">
            <Input />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={busyAction === 'account-submit'}>
            Save provider account
          </Button>
        </Form>
      </Modal>

      <Modal
        title={keyEditing ? 'Edit API key' : 'Add API key'}
        open={keyModalOpen}
        onCancel={() => setKeyModalOpen(false)}
        footer={null}
        width={760}
        destroyOnHidden
      >
        <Form form={keyForm} layout="vertical" onFinish={(values) => void submitKey(values)}>
          {!keyEditing ? (
            <>
              <Form.Item name="providerAccountId" label="Provider account" rules={[{ required: true }]}>
                <Select
                  options={accounts.map((account) => ({
                    value: account.id,
                    label: `${account.provider} · ${account.accountName}`,
                  }))}
                />
              </Form.Item>
              <Form.Item name="apiKey" label="API key secret" rules={[{ required: true }]}>
                <Input.Password />
              </Form.Item>
            </>
          ) : null}
          <Flex gap={12}>
            <Form.Item name="keyName" label="Key name" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="status" label="Status" style={{ flex: 1 }}>
              <Select allowClear options={EXTERNAL_API_KEY_STATUSES.map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item name="priority" label="Priority" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Flex gap={12}>
            <Form.Item name="environment" label="Environment" style={{ flex: 1 }}>
              <Input placeholder="production" />
            </Form.Item>
            <Form.Item name="allowedTaskTypes" label="Allowed tasks" style={{ flex: 2 }}>
              <Select mode="multiple" options={EXTERNAL_PROVIDER_TASK_TYPES.map((value) => ({ value, label: value }))} />
            </Form.Item>
          </Flex>
          <Form.Item name="allowedOrganizationIds" label="Allowed organizations">
            <Select mode="tags" tokenSeparators={[',']} />
          </Form.Item>
          <Flex gap={12}>
            <Form.Item name="dailyRequestLimit" label="Daily requests" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="weeklyRequestLimit" label="Weekly requests" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="monthlyRequestLimit" label="Monthly requests" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Flex gap={12}>
            <Form.Item name="dailyCreditLimit" label="Daily credits" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="weeklyCreditLimit" label="Weekly credits" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="monthlyCreditLimit" label="Monthly credits" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Flex gap={12}>
            <Form.Item name="dailyRecordLimit" label="Daily records" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="weeklyRecordLimit" label="Weekly records" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="monthlyRecordLimit" label="Monthly records" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Flex gap={12}>
            <Form.Item name="dailyCostLimit" label="Daily cost limit" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="weeklyCostLimit" label="Weekly cost limit" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="monthlyCostLimit" label="Monthly cost limit" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Button type="primary" htmlType="submit" block loading={busyAction === 'key-submit'}>
            Save API key
          </Button>
        </Form>
      </Modal>

      <Modal
        title={routeEditing ? 'Edit route' : 'Add route'}
        open={routeModalOpen}
        onCancel={() => setRouteModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={routeForm} layout="vertical" onFinish={(values) => void submitRoute(values)}>
          {!routeEditing ? (
            <Form.Item name="taskType" label="Task type" rules={[{ required: true }]}>
              <Select options={EXTERNAL_PROVIDER_TASK_TYPES.map((value) => ({ value, label: value }))} />
            </Form.Item>
          ) : null}
          <Form.Item name="primaryProvider" label="Primary provider" rules={[{ required: true }]}>
            <Select options={EXTERNAL_PROVIDERS.map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item name="fallbackProvider" label="Fallback provider">
            <Select allowClear options={EXTERNAL_PROVIDERS.map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item name="fallback2Provider" label="Fallback provider #2">
            <Select allowClear options={EXTERNAL_PROVIDERS.map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item name="fallback3Provider" label="Fallback provider #3">
            <Select allowClear options={EXTERNAL_PROVIDERS.map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Flex gap={12}>
            <Form.Item name="timeoutMs" label="Timeout (ms)" style={{ flex: 1 }}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maxAttempts" label="Max attempts" style={{ flex: 1 }}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Flex gap={12}>
            <Form.Item name="allowManualFallback" label="Manual fallback" valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
            <Form.Item name="requiresBrowser" label="Requires browser" valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
            <Form.Item name="requiresJson" label="Requires JSON" valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
            <Form.Item name="isActive" label="Active" valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
          </Flex>
          <Button type="primary" htmlType="submit" block loading={busyAction === 'route-submit'}>
            Save route
          </Button>
        </Form>
      </Modal>

      <Modal
        title={costRuleEditing ? 'Edit cost rule' : 'Add cost rule'}
        open={costRuleModalOpen}
        onCancel={() => { setCostRuleModalOpen(false); setCostRuleEditing(null); costRuleForm.resetFields(); }}
        onOk={() => costRuleForm.submit()}
        confirmLoading={busyAction === 'cost-rule-submit'}
        width={700}
        destroyOnHidden
      >
        <Form form={costRuleForm} layout="vertical" onFinish={(values) => void submitCostRule(values)}>
          <Flex gap={16} wrap>
            <Form.Item name="provider" label="Provider" style={{ width: 200 }} rules={[{ required: true }]}>
              <Select options={EXTERNAL_PROVIDERS.map((p) => ({ label: p, value: p }))} />
            </Form.Item>
            <Form.Item name="ruleName" label="Rule name" style={{ width: 280 }} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="ruleScope" label="Rule scope" style={{ width: 200 }} rules={[{ required: true }]}>
              <Select options={EXTERNAL_COST_RULE_SCOPES.map((s) => ({ label: s, value: s }))} />
            </Form.Item>
            <Form.Item name="taskType" label="Task type" style={{ width: 240 }}>
              <Select options={EXTERNAL_PROVIDER_TASK_TYPES.map((t) => ({ label: t, value: t }))} allowClear showSearch />
            </Form.Item>
            <Form.Item name="endpointKey" label="Endpoint key" style={{ width: 260 }}>
              <Input placeholder="e.g. bright_data.linkedin_posts_dataset" />
            </Form.Item>
            <Form.Item name="datasetKey" label="Dataset key" style={{ width: 200 }}>
              <Input placeholder="e.g. linkedin_posts" />
            </Form.Item>
            <Form.Item name="actorKey" label="Actor key" style={{ width: 200 }}>
              <Input placeholder="e.g. apify.linkedin_profile_actor" />
            </Form.Item>
            <Form.Item name="unitType" label="Unit type" style={{ width: 200 }} rules={[{ required: true }]}>
              <Select options={EXTERNAL_PROVIDER_UNIT_TYPES.map((u) => ({ label: u, value: u }))} />
            </Form.Item>
            <Form.Item name="billingEvent" label="Billing event" style={{ width: 220 }}>
              <Select options={EXTERNAL_BILLING_EVENTS.map((e) => ({ label: e, value: e }))} defaultValue="after_success" />
            </Form.Item>
            <Form.Item name="unitsPerSuccessfulRecord" label="Units/successful record" style={{ width: 200 }}>
              <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="unitsPerRecord" label="Units/record" style={{ width: 160 }}>
              <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="unitsPerPage" label="Units/page" style={{ width: 140 }}>
              <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="unitsPerRequest" label="Units/request" style={{ width: 150 }}>
              <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="unitsPerResult" label="Units/result" style={{ width: 150 }}>
              <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="unitsPerSearch" label="Units/search" style={{ width: 150 }}>
              <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="unitPriceUsd" label="Unit price (USD)" style={{ width: 160 }}>
              <InputNumber min={0} step={0.001} precision={6} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="minimumUnits" label="Minimum units" style={{ width: 150 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maximumUnits" label="Maximum units" style={{ width: 150 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="priority" label="Priority (lower = higher specificity)" style={{ width: 260 }}>
              <InputNumber min={0} defaultValue={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="freeTierEligible" label="Free tier eligible" valuePropName="checked" style={{ width: 180 }}>
              <Switch defaultChecked />
            </Form.Item>
            <Form.Item name="isActive" label="Active" valuePropName="checked" style={{ width: 120 }}>
              <Switch defaultChecked />
            </Form.Item>
          </Flex>
          <Form.Item name="formulaJson" label="Formula JSON">
            <Input.TextArea rows={5} style={{ fontFamily: 'monospace', fontSize: 12 }} placeholder='{"billing":"successful_record","units_per_successful_record":1}' />
          </Form.Item>
          <Form.Item name="conditionsJson" label="Conditions JSON">
            <Input.TextArea rows={3} style={{ fontFamily: 'monospace', fontSize: 12 }} placeholder="{}" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Add option multiplier"
        open={optionMultiplierModalOpen}
        onCancel={() => { setOptionMultiplierModalOpen(false); optionMultiplierForm.resetFields(); }}
        onOk={() => optionMultiplierForm.submit()}
        confirmLoading={busyAction === 'multiplier-submit'}
        destroyOnHidden
      >
        <Form form={optionMultiplierForm} layout="vertical" onFinish={(values) => void submitOptionMultiplier(values)}>
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select options={EXTERNAL_PROVIDERS.map((p) => ({ label: p, value: p }))} />
          </Form.Item>
          <Form.Item name="optionKey" label="Option key" rules={[{ required: true }]}>
            <Input placeholder="e.g. render_js, premium_proxy, screenshot" />
          </Form.Item>
          <Form.Item name="optionValue" label="Option value match">
            <Input placeholder="e.g. true (leave blank for any truthy)" />
          </Form.Item>
          <Form.Item name="multiplier" label="Multiplier" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.5} precision={4} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="additionalUnits" label="Additional units">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="additionalCostUsd" label="Additional cost (USD)">
            <InputNumber min={0} step={0.001} precision={6} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="appliesToTaskTypes" label="Applies to task types (blank = all)">
            <Select mode="tags" options={EXTERNAL_PROVIDER_TASK_TYPES.map((t) => ({ label: t, value: t }))} />
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch defaultChecked />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Add endpoint catalog entry"
        open={endpointModalOpen}
        onCancel={() => { setEndpointModalOpen(false); endpointForm.resetFields(); }}
        onOk={() => endpointForm.submit()}
        confirmLoading={busyAction === 'endpoint-submit'}
        width={600}
        destroyOnHidden
      >
        <Form form={endpointForm} layout="vertical" onFinish={(values) => void submitEndpoint(values)}>
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select options={EXTERNAL_PROVIDERS.map((p) => ({ label: p, value: p }))} />
          </Form.Item>
          <Form.Item name="endpointKey" label="Endpoint key" rules={[{ required: true }]}>
            <Input placeholder="e.g. bright_data.linkedin_posts_dataset" />
          </Form.Item>
          <Form.Item name="displayName" label="Display name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Bright Data LinkedIn Posts" />
          </Form.Item>
          <Form.Item name="taskTypes" label="Task types">
            <Select mode="tags" options={EXTERNAL_PROVIDER_TASK_TYPES.map((t) => ({ label: t, value: t }))} />
          </Form.Item>
          <Form.Item name="datasetKey" label="Dataset key">
            <Input placeholder="e.g. linkedin_posts" />
          </Form.Item>
          <Form.Item name="actorKey" label="Actor key">
            <Input placeholder="e.g. apify.linkedin_profile_actor" />
          </Form.Item>
          <Form.Item name="defaultUnitType" label="Default unit type">
            <Select options={EXTERNAL_PROVIDER_UNIT_TYPES.map((u) => ({ label: u, value: u }))} allowClear />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="supportsTestFlow" label="Supports test flow" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch defaultChecked />
          </Form.Item>
        </Form>
      </Modal>
    </Flex>
  );
}
