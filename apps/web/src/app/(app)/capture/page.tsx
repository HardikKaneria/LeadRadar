
import { useEffect, useState } from 'react';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InboxOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Progress,
  Result,
  Row,
  Segmented,
  Select,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
  theme,
  type TableProps,
  type UploadFile,
} from 'antd';
import { DISCOVERY_SOURCES, type DiscoverySource, type ManualDiscoveryInput } from '@radar/contracts';
import { api, type Job } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import {
  CSV_FIELDS,
  CSV_FIELD_LABELS,
  newIdempotencyKey,
  previewCsv,
  uploadCsvFile,
  type CsvPreview,
} from '@/lib/ingestion';

const { Text, Link: TypographyLink } = Typography;

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const IDENTIFIER_FIELDS = ['title', 'description', 'companyName', 'contactName', 'email', 'phone', 'website'] as const;

const SOURCE_OPTIONS = DISCOVERY_SOURCES.map((s) => ({
  value: s,
  label: s
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' '),
}));

function toLabel(value: string): string {
  return value
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

interface AcceptedJob {
  jobId: string;
  batchId: string;
}

/** Polls a single ingestion job and shows live progress until it reaches a terminal status. */
function JobProgressCard({
  accessToken,
  organizationId,
  job,
}: {
  accessToken: string;
  organizationId: string;
  job: AcceptedJob;
}) {
  const { token } = theme.useToken();
  const [data, setData] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctx = { accessToken, organizationId };

    const poll = async () => {
      try {
        const next = await api.job(ctx, job.jobId);
        if (cancelled) return;
        setData(next);
        setError(null);
        if (!TERMINAL.has(next.status)) timer = setTimeout(poll, 2000);
      } catch (err) {
        if (cancelled) return;
        setError(getErrorMessage(err));
        timer = setTimeout(poll, 4000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [accessToken, organizationId, job.jobId]);

  const status = data?.status ?? 'queued';
  const percent = Math.min(100, Math.max(0, data?.progress ?? 0));
  const done = TERMINAL.has(status);
  const failed = status === 'failed' || status === 'cancelled';

  return (
    <Card
      title={
        <Flex align="center" gap={8}>
          {done ? (
            failed ? (
              <CloseCircleOutlined style={{ color: token.colorError }} />
            ) : (
              <CheckCircleOutlined style={{ color: token.colorSuccess }} />
            )
          ) : null}
          <span>{done ? (failed ? 'Import failed' : 'Import complete') : 'Processing capture…'}</span>
        </Flex>
      }
    >
      <Flex vertical gap={12}>
        <Progress percent={percent} status={failed ? 'exception' : done ? 'success' : 'active'} />
        <Flex align="center" gap={8} wrap>
          <Tag variant="filled" style={{ textTransform: 'capitalize' }}>
            {status}
          </Tag>
          <Text type="secondary" className="font-mono" style={{ fontSize: 12 }}>
            job {job.jobId.slice(0, 8)} · batch {job.batchId.slice(0, 8)}
          </Text>
        </Flex>
        {error && <Alert type="warning" showIcon title={error} />}
        {done && !failed && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            Normalized records landed in the{' '}
            <TypographyLink href="/inbox">Discovery Inbox</TypographyLink>.
          </Text>
        )}
      </Flex>
    </Card>
  );
}

function ManualCapture({ accessToken, organizationId }: { accessToken: string; organizationId: string }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ManualDiscoveryInput>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<AcceptedJob | null>(null);

  const watched = Form.useWatch([], form);
  const hasIdentifier = IDENTIFIER_FIELDS.some((f) => {
    const value = (watched as Record<string, unknown> | undefined)?.[f];
    return typeof value === 'string' && value.trim().length > 0;
  });

  async function onFinish(values: ManualDiscoveryInput) {
    setBusy(true);
    setError(null);
    setAccepted(null);
    try {
      const payload: ManualDiscoveryInput = { ...values, source: values.source ?? 'manual' };
      const res = await api.ingestManual({ accessToken, organizationId }, payload, newIdempotencyKey());
      setAccepted(res);
      form.resetFields();
      message.success('Discovery enqueued');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} xl={16}>
        <Card title="New discovery">
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={{ source: 'manual' }}
            onFinish={onFinish}
            disabled={busy}
          >
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item name="source" label="Source">
                  <Select options={SOURCE_OPTIONS} showSearch optionFilterProp="label" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="title" label="Title">
                  <Input placeholder="Landing page redesign" maxLength={240} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="companyName" label="Company">
                  <Input placeholder="Acme Inc." maxLength={240} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="contactName" label="Contact name">
                  <Input placeholder="Jordan Lee" maxLength={240} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="email"
                  label="Email"
                  rules={[{ type: 'email', message: 'Enter a valid email' }]}
                >
                  <Input placeholder="jordan@acme.com" maxLength={240} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="phone" label="Phone">
                  <Input placeholder="+1 555 010 0199" maxLength={80} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="website" label="Website">
                  <Input placeholder="https://acme.com" maxLength={500} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="country" label="Country">
                  <Input placeholder="United States" maxLength={120} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="budgetHint" label="Budget hint">
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    placeholder="5000"
                    formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
                    parser={(v) => Number((v ?? '').replace(/,/g, '')) as 0}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="description" label="Description">
              <Input.TextArea rows={4} placeholder="What does the opportunity involve?" maxLength={10000} showCount />
            </Form.Item>

            <Form.Item
              name="notes"
              label="Internal notes"
              extra="Context for your team — not shown to the lead."
            >
              <Input.TextArea rows={2} maxLength={4000} />
            </Form.Item>

            {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}

            <Flex align="center" gap={12}>
              <Button
                type="primary"
                htmlType="submit"
                icon={<PlusOutlined />}
                loading={busy}
                disabled={!hasIdentifier}
              >
                Add discovery
              </Button>
              <Button type="text" onClick={() => form.resetFields()} disabled={busy}>
                Clear
              </Button>
              {!hasIdentifier && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Provide at least one identifying field to continue.
                </Text>
              )}
            </Flex>
          </Form>
        </Card>
      </Col>

      <Col xs={24} xl={8}>
        {accepted ? (
          <JobProgressCard accessToken={accessToken} organizationId={organizationId} job={accepted} />
        ) : (
          <Card title="Last submission">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Submit the form to enqueue an ingestion job. Its progress appears here, then the record lands in the Inbox."
            />
          </Card>
        )}
      </Col>
    </Row>
  );
}

function CsvCapture({ accessToken, organizationId }: { accessToken: string; organizationId: string }) {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [defaultSource, setDefaultSource] = useState<DiscoverySource>('csv');
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<AcceptedJob | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    void previewCsv(file, hasHeader)
      .then((res) => !cancelled && (setPreview(res), setPreviewError(null)))
      .catch((err: unknown) => !cancelled && (setPreview(null), setPreviewError(getErrorMessage(err))));
    return () => {
      cancelled = true;
    };
  }, [file, hasHeader]);

  function clearFile() {
    setFile(null);
    setPreview(null);
    setPreviewError(null);
  }

  async function startImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setAccepted(null);
    try {
      const res = await api.ingestCsv(
        { accessToken, organizationId },
        { fileName: file.name, contentType: file.type || 'text/csv', hasHeader, defaultSource },
        newIdempotencyKey(),
      );
      await uploadCsvFile(res.upload, file);
      setAccepted({ jobId: res.jobId, batchId: res.batchId });
      message.success('CSV uploaded — import started');
      clearFile();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const fileList: UploadFile[] = file ? [{ uid: '1', name: file.name, status: 'done' }] : [];

  const previewColumns: TableProps['columns'] = (preview?.headers ?? []).map((header, index) => ({
    title: header,
    dataIndex: String(index),
    key: String(index),
    ellipsis: true,
  }));
  const previewData = (preview?.sampleRows ?? []).map((row, rowIndex) => {
    const record: Record<string, string> = { key: String(rowIndex) };
    row.forEach((cell, colIndex) => {
      record[String(colIndex)] = cell;
    });
    return record;
  });

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} xl={16}>
        <Card title="Import CSV">
          <Flex vertical gap={16}>
            <Upload.Dragger
              accept=".csv,text/csv"
              multiple={false}
              maxCount={1}
              fileList={fileList}
              beforeUpload={(f) => {
                setFile(f as unknown as File);
                return false;
              }}
              onRemove={() => {
                clearFile();
                return true;
              }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag a CSV file here</p>
              <p className="ant-upload-hint">
                Columns are matched by header name (company, email, budget…). Unmatched columns are
                kept in the raw payload.
              </p>
            </Upload.Dragger>

            <Row gutter={16} align="middle">
              <Col xs={24} sm={12}>
                <Flex align="center" justify="space-between" gap={8}>
                  <Text>First row is a header</Text>
                  <Switch checked={hasHeader} onChange={setHasHeader} />
                </Flex>
              </Col>
              <Col xs={24} sm={12}>
                <Flex align="center" gap={8}>
                  <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
                    Default source
                  </Text>
                  <Select
                    style={{ flex: 1 }}
                    value={defaultSource}
                    onChange={setDefaultSource}
                    options={SOURCE_OPTIONS}
                    showSearch
                    optionFilterProp="label"
                  />
                </Flex>
              </Col>
            </Row>

            {previewError && <Alert type="error" showIcon title={previewError} />}

            {preview && (
              <>
                <Descriptions
                  title="Detected field mapping"
                  size="small"
                  column={{ xs: 1, sm: 2 }}
                  bordered
                  extra={
                    <Text type="secondary">
                      {preview.totalRows} row{preview.totalRows === 1 ? '' : 's'}
                    </Text>
                  }
                  items={CSV_FIELDS.map((field) => {
                    const matched = preview.mapping[field];
                    return {
                      key: field,
                      label: CSV_FIELD_LABELS[field],
                      children: matched ? (
                        <Tag variant="filled" color="success">
                          {matched}
                        </Tag>
                      ) : field === 'source' ? (
                        <Text type="secondary">{toLabel(defaultSource)} (default)</Text>
                      ) : (
                        <Text type="secondary">—</Text>
                      ),
                    };
                  })}
                />

                {!hasHeader && (
                  <Alert
                    type="info"
                    showIcon
                    title="Without a header row, columns can't be auto-mapped. Add a header row for reliable field detection."
                  />
                )}

                {previewData.length > 0 && (
                  <Table
                    size="small"
                    columns={previewColumns}
                    dataSource={previewData}
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                  />
                )}
              </>
            )}

            {error && <Alert type="error" showIcon title={error} />}

            <Flex align="center" gap={12}>
              <Button type="primary" icon={<UploadOutlined />} loading={busy} disabled={!file} onClick={() => void startImport()}>
                Start import
              </Button>
              {file && (
                <Button type="text" onClick={clearFile} disabled={busy}>
                  Remove file
                </Button>
              )}
            </Flex>
          </Flex>
        </Card>
      </Col>

      <Col xs={24} xl={8}>
        {accepted ? (
          <JobProgressCard accessToken={accessToken} organizationId={organizationId} job={accepted} />
        ) : (
          <Card title="Import progress">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Start an import to upload the file and enqueue the parser. Row counts and completion status appear here."
            />
          </Card>
        )}
      </Col>
    </Row>
  );
}

export default function CapturePage() {
  const { accessToken, currentOrg, can } = useAuth();
  const [mode, setMode] = useState<'manual' | 'csv'>('manual');

  const canWrite = can('discoveries.write');
  const organizationId = currentOrg?.organizationId ?? null;

  if (!currentOrg) {
    return (
      <Result status="info" title="No workspace yet" subTitle="Join or create a workspace before capturing discoveries." />
    );
  }

  if (!canWrite) {
    return (
      <Result
        status="403"
        title="You can't capture here"
        subTitle="Your current role does not include discoveries.write."
      />
    );
  }

  if (!accessToken || !organizationId) {
    return <Result status="warning" title="Session expired" subTitle="Reload the page to continue." />;
  }

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Ingestion"
        title="Capture"
        subtitle="Add opportunities by hand or import a CSV. Records are normalized, de-duplicated, then land in the Inbox."
        extra={
          <Segmented
            value={mode}
            onChange={(value) => setMode(value as 'manual' | 'csv')}
            options={[
              { label: 'Manual entry', value: 'manual', icon: <PlusOutlined /> },
              { label: 'CSV import', value: 'csv', icon: <UploadOutlined /> },
            ]}
          />
        }
      />

      {mode === 'manual' ? (
        <ManualCapture accessToken={accessToken} organizationId={organizationId} />
      ) : (
        <CsvCapture accessToken={accessToken} organizationId={organizationId} />
      )}
    </Flex>
  );
}
