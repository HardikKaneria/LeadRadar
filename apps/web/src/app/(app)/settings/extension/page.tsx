
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Result,
  Skeleton,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ApiOutlined, CheckCircleOutlined, ChromeOutlined, DisconnectOutlined, LinkOutlined } from '@ant-design/icons';
import type {
  ExtensionHealthSummary,
  ExtensionTokenCreated,
  ExtensionTokenCreateInput,
  ExtensionTokenSummary,
} from '@radar/contracts';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';
import { PageSection } from '@/components/ui/page-section';

const { Text, Paragraph } = Typography;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

type ConnectState = 'idle' | 'checking' | 'creating' | 'sending' | 'success' | 'no-extension' | 'error';

function detectExtension(): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(false);
    }, 1500);

    function handler(event: MessageEvent) {
      if (event.data?.type === 'radar:pong') {
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(true);
      }
    }

    window.addEventListener('message', handler);
    window.postMessage({ type: 'radar:ping' }, '*');
  });
}

export default function ExtensionSettingsPage() {
  const { accessToken, currentOrg, can } = useAuth();
  const { message } = App.useApp();
  const canUseExtension = can('extension.use');

  const [loading, setLoading] = useState(false);
  const [tokens, setTokens] = useState<ExtensionTokenSummary[]>([]);
  const [health, setHealth] = useState<ExtensionHealthSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<ExtensionTokenCreated | null>(null);
  const [creating, setCreating] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [connectState, setConnectState] = useState<ConnectState>('idle');
  const [connectError, setConnectError] = useState<string | null>(null);
  const replyListenerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const [form] = Form.useForm<ExtensionTokenCreateInput>();

  const ctx = useMemo(
    () =>
      accessToken && currentOrg
        ? {
            accessToken,
            organizationId: currentOrg.organizationId,
          }
        : null,
    [accessToken, currentOrg],
  );

  useEffect(() => {
    if (!ctx || !canUseExtension) {
      setTokens([]);
      setHealth(null);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void Promise.all([api.extensionTokens(ctx), api.extensionHealth(ctx)])
      .then(([nextTokens, nextHealth]) => {
        if (cancelled) return;
        setTokens(nextTokens);
        setHealth(nextHealth);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ctx, canUseExtension, reloadToken]);

  async function handleCreate(values: ExtensionTokenCreateInput) {
    if (!ctx) return;
    setCreating(true);
    try {
      const created = await api.createExtensionToken(ctx, values);
      setCreatedToken(created);
      form.resetFields();
      message.success('Created a new scoped extension token.');
      setReloadToken((value) => value + 1);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    if (!ctx) return;
    try {
      await api.revokeExtensionToken(ctx, tokenId);
      message.success('Revoked extension token.');
      setReloadToken((value) => value + 1);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  async function handleConnect() {
    if (!ctx) return;
    setConnectError(null);

    // Step 1: check extension is installed
    setConnectState('checking');
    const found = await detectExtension();
    if (!found) {
      setConnectState('no-extension');
      return;
    }

    // Step 2: create a scoped token via API
    setConnectState('creating');
    let token: string;
    try {
      const created = await api.createExtensionToken(ctx, {
        name: `Auto-connect · ${new Date().toLocaleDateString()}`,
      });
      token = created.token;
      setReloadToken((v) => v + 1);
    } catch (err) {
      setConnectState('error');
      setConnectError(getErrorMessage(err));
      return;
    }

    // Step 3: send token to extension via postMessage bridge
    setConnectState('sending');
    const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
    const workspaceName = currentOrg?.organizationName ?? 'Radar Workspace';

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Extension did not respond in time. Make sure the extension is installed and reload this page.'));
      }, 6000);

      function onReply(event: MessageEvent) {
        if (event.data?.type !== 'radar:authorize:reply') return;
        cleanup();
        if (event.data.ok) resolve();
        else reject(new Error(event.data.error ?? 'Extension rejected the connection.'));
      }

      function cleanup() {
        clearTimeout(timeout);
        window.removeEventListener('message', onReply);
        replyListenerRef.current = null;
      }

      replyListenerRef.current = onReply;
      window.addEventListener('message', onReply);
      window.postMessage({ type: 'radar:authorize', token, apiBaseUrl, workspaceName }, '*');
    }).then(() => {
      setConnectState('success');
    }).catch((err) => {
      setConnectState('error');
      setConnectError(getErrorMessage(err));
    });
  }

  if (!ctx) {
    return (
      <Result
        status="info"
        title="Sign in to manage the extension"
        subTitle="The browser extension uses scoped tokens tied to an authenticated workspace member."
      />
    );
  }

  if (!canUseExtension) {
    return (
      <Result
        status="403"
        title="Extension access is not enabled for this member"
        subTitle="Ask an owner or admin to grant the `extension.use` permission before managing capture tokens."
      />
    );
  }

  const connectStepIndex = { idle: -1, checking: 0, 'no-extension': 0, creating: 1, sending: 2, success: 2, error: -1 }[connectState];
  const connectLoading = connectState === 'checking' || connectState === 'creating' || connectState === 'sending';

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Settings"
        title="Extension"
        subtitle="Connect the Chrome extension to your workspace in one click — no copy-pasting tokens."
      />

      {/* ── One-click connect card ── */}
      <Card
        style={{ borderColor: connectState === 'success' ? '#52c41a' : undefined }}
        title={<Flex align="center" gap={8}><ChromeOutlined /> Connect Extension</Flex>}
      >
        {connectState === 'success' ? (
          <Flex align="center" gap={12} style={{ padding: '8px 0' }}>
            <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />
            <div>
              <Text strong style={{ display: 'block' }}>Extension connected!</Text>
              <Text type="secondary">Click the Radar icon in your Chrome toolbar — it should show your workspace.</Text>
            </div>
          </Flex>
        ) : connectState === 'no-extension' ? (
          <Flex vertical gap={12}>
            <Alert
              type="warning"
              showIcon
              message="Extension not detected"
              description={
                <span>
                  Make sure the Radar extension is installed and loaded from <code>extension/dist/</code> in Chrome.{' '}
                  <a href="chrome://extensions" target="_blank" rel="noreferrer">Open Extensions →</a>
                </span>
              }
            />
            <Button onClick={() => setConnectState('idle')}>Try again</Button>
          </Flex>
        ) : (
          <Flex vertical gap={16}>
            <Flex align="center" gap={16} wrap>
              <Flex vertical gap={4} style={{ flex: 1 }}>
                <Text strong>One-click connect</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Automatically creates a scoped token and sends it directly to the extension — no copy-pasting, no API URL needed.
                </Text>
              </Flex>
              <Button
                type="primary"
                icon={<LinkOutlined />}
                loading={connectLoading}
                onClick={() => void handleConnect()}
                size="large"
              >
                Connect Extension
              </Button>
            </Flex>

            {connectLoading && (
              <Steps
                size="small"
                current={connectStepIndex}
                items={[
                  { title: 'Detect extension', icon: <ChromeOutlined /> },
                  { title: 'Create token', icon: <ApiOutlined /> },
                  { title: 'Send to extension', icon: <LinkOutlined /> },
                ]}
              />
            )}

            {connectState === 'error' && connectError && (
              <Alert type="error" showIcon title={connectError} action={<Button size="small" onClick={() => setConnectState('idle')}>Retry</Button>} />
            )}

            <Flex align="center" gap={6}>
              <DisconnectOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Extension not installed?{' '}
                Load <code>extension/dist/</code> as an unpacked extension in <code>chrome://extensions</code>.
              </Text>
            </Flex>
          </Flex>
        )}
      </Card>

      {loadError ? <Alert type="error" showIcon title={loadError} /> : null}

      <Flex gap={16} wrap>
        <MetricCard eyebrow="Active tokens" value={health?.activeTokenCount ?? 0} loading={loading} />
        <MetricCard eyebrow="Recent batches" value={health?.recentBatches.length ?? 0} loading={loading} />
        <MetricCard eyebrow="Parser versions" value={health?.parserHealth.length ?? 0} loading={loading} />
      </Flex>

      <PageSection
        title="Tokens"
        subtitle="Generate one-time credentials for the extension popup or options page. Tokens are scoped to extension capture only."
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            label="Token name"
            name="name"
            rules={[{ required: true, message: 'Give the token a descriptive name.' }]}
          >
            <Input placeholder="Chrome extension · Hardik laptop" />
          </Form.Item>
          <Form.Item label="Optional expiration" name="expiresAt" extra="Use an ISO timestamp if you want the token to expire automatically.">
            <Input placeholder="2026-07-01T00:00:00.000Z" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={creating}>
            Generate token
          </Button>
        </Form>
      </PageSection>

      <PageSection
        title="Issued tokens"
        subtitle="These tokens are revocable and never expose the full workspace session to the browser extension."
      >
        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : tokens.length === 0 ? (
          <EmptyState
            description="No extension tokens yet. Create one to connect a browser profile to the capture flow."
          />
        ) : (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={tokens}
            columns={[
              {
                title: 'Name',
                dataIndex: 'name',
                key: 'name',
                render: (value: string) => <Text strong>{value}</Text>,
              },
              {
                title: 'Scopes',
                dataIndex: 'scopes',
                key: 'scopes',
                render: (value: string[]) => (
                  <Flex wrap gap={6}>
                    {value.map((scope) => (
                      <Tag key={scope} variant="filled">
                        {scope}
                      </Tag>
                    ))}
                  </Flex>
                ),
              },
              {
                title: 'Last used',
                dataIndex: 'lastUsedAt',
                key: 'lastUsedAt',
                render: (value: string | null) => formatDateTime(value),
              },
              {
                title: 'Expires',
                dataIndex: 'expiresAt',
                key: 'expiresAt',
                render: (value: string | null) => formatDateTime(value),
              },
              {
                title: 'Status',
                key: 'status',
                render: (_: unknown, row: ExtensionTokenSummary) =>
                  row.revokedAt ? (
                    <Tag color="default" variant="filled">Revoked</Tag>
                  ) : (
                    <Tag color="success" variant="filled">Active</Tag>
                  ),
              },
              {
                title: 'Action',
                key: 'action',
                render: (_: unknown, row: ExtensionTokenSummary) =>
                  row.revokedAt ? (
                    <Text type="secondary">—</Text>
                  ) : (
                    <Popconfirm
                      title="Revoke this token?"
                      description="The extension will stop accepting this token immediately."
                      onConfirm={() => handleRevoke(row.id)}
                    >
                      <Button danger type="text">
                        Revoke
                      </Button>
                    </Popconfirm>
                  ),
              },
            ]}
          />
        )}
      </PageSection>

      <PageSection
        title="Recent extension batches"
        subtitle="Review the latest extension-originated discovery batches and surface parser drift quickly."
      >
        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : !health || health.recentBatches.length === 0 ? (
          <EmptyState description="No extension batches yet. The first successful browser capture will show up here." />
        ) : (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={health.recentBatches}
            columns={[
              { title: 'Source', dataIndex: 'source', key: 'source' },
              { title: 'Parser', dataIndex: 'parserVersion', key: 'parserVersion' },
              { title: 'Items', dataIndex: 'itemCount', key: 'itemCount' },
              {
                title: 'Status',
                dataIndex: 'status',
                key: 'status',
                render: (value: string) => <Tag variant="filled">{value}</Tag>,
              },
              {
                title: 'Created',
                dataIndex: 'createdAt',
                key: 'createdAt',
                render: (value: string) => formatDateTime(value),
              },
              {
                title: 'Notes',
                dataIndex: 'error',
                key: 'error',
                render: (value: string | null) => value || '—',
              },
            ]}
          />
        )}
      </PageSection>

      <PageSection
        title="Parser health"
        subtitle="Track which parser versions are active and whether any supported source is starting to fail more often than expected."
      >
        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : !health || health.parserHealth.length === 0 ? (
          <EmptyState description="No parser health data yet. Once extension batches flow in, parser-version health is summarized here." />
        ) : (
          <Flex vertical gap={12}>
            {health.parserHealth.map((parser) => (
              <PageSection key={parser.parserVersion} size="small">
                <Flex justify="space-between" gap={16} wrap>
                  <div>
                    <Text strong>{parser.parserVersion}</Text>
                    <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
                      Latest batch {formatDateTime(parser.latestBatchAt)}
                    </Paragraph>
                  </div>
                  <Flex gap={16} wrap>
                    <Text>Total {parser.totalBatches}</Text>
                    <Text>Failed {parser.failedBatches}</Text>
                  </Flex>
                </Flex>
              </PageSection>
            ))}
          </Flex>
        )}
      </PageSection>

      <Modal
        open={Boolean(createdToken)}
        title="Capture token generated"
        onCancel={() => setCreatedToken(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setCreatedToken(null)}>
            Done
          </Button>,
        ]}
      >
        <Paragraph>
          Copy this token into the Chrome extension popup or options page now. It is only shown once.
        </Paragraph>
        <Input.TextArea readOnly value={createdToken?.token ?? ''} rows={4} />
      </Modal>
    </Flex>
  );
}
