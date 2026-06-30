
import { useEffect, useMemo, useState } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Flex,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Result,
  Row,
  Select,
  Skeleton,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  COMPANY_BAD_LEAD_RULE_FIELDS,
  COMPANY_BAD_LEAD_RULE_LOGICS,
  COMPANY_BAD_LEAD_RULE_OPERATORS,
  companyProfileInputSchema,
  type CompanyBadLeadRules,
  type CompanyProfileVersion,
} from '@radar/contracts';
import {
  createCompanyProfileVersion,
  getActiveCompanyProfile,
  listCompanyProfileVersions,
} from '@/lib/company-brain';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { PageSection } from '@/components/ui/page-section';
import { SettingsSaveBar } from '@/components/ui/settings-save-bar';
import { ScoringStrategiesList } from '@/components/company-brain/scoring-strategies-list';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

type RuleField = (typeof COMPANY_BAD_LEAD_RULE_FIELDS)[number];
type RuleOperator = (typeof COMPANY_BAD_LEAD_RULE_OPERATORS)[number];

interface RuleDraft {
  id: string;
  field: RuleField;
  operator: RuleOperator;
  value: string;
}

interface EditorState {
  servicesText: string;
  priorityServicesText: string;
  targetIndustriesText: string;
  targetCountriesText: string;
  minBudget: string;
  outreachTone: string;
  idealCustomerSummary: string;
  idealCustomerCompanySizesText: string;
  idealCustomerBuyerRolesText: string;
  idealCustomerRegionsText: string;
  idealCustomerPainPointsText: string;
  idealCustomerNotes: string;
  badLeadLogic: CompanyBadLeadRules['logic'];
  badLeadRules: RuleDraft[];
}

function createRuleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

function toLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatBudget(value: number | null): string {
  return value == null ? 'No floor' : value.toLocaleString();
}

function formatList(values: string[]): string {
  return values.join('\n');
}

function parseList(value: string): string[] {
  const normalized = value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return Array.from(new Set(normalized));
}

function getOperatorOptions(field: RuleField): RuleOperator[] {
  if (field === 'website') return ['exists', 'not_exists'];
  if (field === 'budget') return ['equals', 'lt', 'gt', 'exists', 'not_exists'];
  return ['equals', 'contains', 'in', 'exists', 'not_exists'];
}

function normalizeRule(field: RuleField, operator?: RuleOperator): Pick<RuleDraft, 'field' | 'operator'> {
  const operators = getOperatorOptions(field);
  return { field, operator: operator && operators.includes(operator) ? operator : operators[0] };
}

function createEmptyRule(): RuleDraft {
  return { id: createRuleId(), ...normalizeRule('industry'), value: '' };
}

function createEmptyEditor(): EditorState {
  return {
    servicesText: '',
    priorityServicesText: '',
    targetIndustriesText: '',
    targetCountriesText: '',
    minBudget: '',
    outreachTone: '',
    idealCustomerSummary: '',
    idealCustomerCompanySizesText: '',
    idealCustomerBuyerRolesText: '',
    idealCustomerRegionsText: '',
    idealCustomerPainPointsText: '',
    idealCustomerNotes: '',
    badLeadLogic: 'any',
    badLeadRules: [],
  };
}

function profileToEditor(profile: CompanyProfileVersion | null): EditorState {
  if (!profile) return createEmptyEditor();
  return {
    servicesText: formatList(profile.services),
    priorityServicesText: formatList(profile.priorityServices),
    targetIndustriesText: formatList(profile.targetIndustries),
    targetCountriesText: formatList(profile.targetCountries),
    minBudget: profile.minBudget == null ? '' : String(profile.minBudget),
    outreachTone: profile.outreachTone ?? '',
    idealCustomerSummary: profile.idealCustomer.summary ?? '',
    idealCustomerCompanySizesText: formatList(profile.idealCustomer.companySizes),
    idealCustomerBuyerRolesText: formatList(profile.idealCustomer.buyerRoles),
    idealCustomerRegionsText: formatList(profile.idealCustomer.regions),
    idealCustomerPainPointsText: formatList(profile.idealCustomer.painPoints),
    idealCustomerNotes: profile.idealCustomer.notes ?? '',
    badLeadLogic: profile.badLeadRules.logic,
    badLeadRules: profile.badLeadRules.rules.map((rule) => ({
      id: createRuleId(),
      field: rule.field,
      operator: rule.operator,
      value: Array.isArray(rule.value) ? rule.value.join('\n') : rule.value == null ? '' : String(rule.value),
    })),
  };
}

function buildRuleValue(rule: RuleDraft): number | string | string[] | undefined {
  if (rule.operator === 'exists' || rule.operator === 'not_exists') return undefined;
  const raw = rule.value.trim();
  if (raw.length === 0) return undefined;
  if (rule.field === 'budget') return Number(raw);
  if (rule.operator === 'in') return parseList(raw);
  return raw;
}

function editorToInput(editor: EditorState) {
  return {
    services: parseList(editor.servicesText),
    priorityServices: parseList(editor.priorityServicesText),
    targetIndustries: parseList(editor.targetIndustriesText),
    idealCustomer: {
      summary: editor.idealCustomerSummary.trim() || undefined,
      companySizes: parseList(editor.idealCustomerCompanySizesText),
      buyerRoles: parseList(editor.idealCustomerBuyerRolesText),
      regions: parseList(editor.idealCustomerRegionsText),
      painPoints: parseList(editor.idealCustomerPainPointsText),
      notes: editor.idealCustomerNotes.trim() || undefined,
    },
    targetCountries: parseList(editor.targetCountriesText),
    minBudget: editor.minBudget.trim() ? Number(editor.minBudget) : null,
    badLeadRules: {
      logic: editor.badLeadLogic,
      rules: editor.badLeadRules.map((rule) => ({ field: rule.field, operator: rule.operator, value: buildRuleValue(rule) })),
    },
    outreachTone: editor.outreachTone.trim() || null,
  };
}

function getRuleValueLabel(rule: RuleDraft): string {
  if (rule.operator === 'in') return 'Values';
  if (rule.field === 'budget') return 'Amount';
  return 'Value';
}

function getRulePlaceholder(rule: RuleDraft): string {
  if (rule.operator === 'in') return 'One value per line';
  if (rule.field === 'budget') return '5000';
  if (rule.field === 'keyword') return 'casino';
  if (rule.field === 'country') return 'United States';
  if (rule.field === 'company_name') return 'Acme';
  return 'Agency';
}

function formatVersionSummary(version: CompanyProfileVersion): string {
  return [
    `${version.services.length} services`,
    `${version.priorityServices.length} priorities`,
    `${version.badLeadRules.rules.length} bad-lead rules`,
  ].join(' · ');
}

/** Uppercase eyebrow label + control wrapper (this page is controlled-state, not AntD Form). */
function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        {label}
      </Text>
      {children}
      {hint && (
        <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
          {hint}
        </Text>
      )}
    </div>
  );
}

export default function CompanyBrainPage() {
  const { currentOrg, can } = useAuth();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const organizationId = currentOrg?.organizationId ?? null;
  const canManage = can('company_brain.manage');

  const [activeProfile, setActiveProfile] = useState<CompanyProfileVersion | null>(null);
  const [versions, setVersions] = useState<CompanyProfileVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(createEmptyEditor);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [scoreThreshold, setScoreThreshold] = useState<number>(60);
  const [savingThreshold, setSavingThreshold] = useState(false);

  useEffect(() => {
    if (!organizationId || !canManage) {
      setActiveProfile(null);
      setVersions([]);
      setSelectedVersionId(null);
      setEditor(createEmptyEditor());
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void Promise.all([
      getActiveCompanyProfile(organizationId),
      listCompanyProfileVersions(organizationId),
      supabase.from('organizations').select('settings').eq('id', organizationId).single(),
    ])
      .then(([active, history, { data: orgRow }]) => {
        if (cancelled) return;
        const nextActive = active ?? history.find((v) => v.isActive) ?? null;
        setActiveProfile(nextActive);
        setVersions(history);
        setSelectedVersionId((current) =>
          current && history.some((v) => v.id === current) ? current : nextActive?.id ?? history[0]?.id ?? null,
        );
        setEditor(profileToEditor(nextActive));
        setValidationErrors([]);
        if (orgRow?.settings && typeof orgRow.settings === 'object' && 'scoreThreshold' in orgRow.settings) {
          setScoreThreshold(Number((orgRow.settings as Record<string, unknown>).scoreThreshold) || 60);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setActiveProfile(null);
        setVersions([]);
        setSelectedVersionId(null);
        setEditor(createEmptyEditor());
        setLoadError(getErrorMessage(error));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [organizationId, canManage, reloadToken]);

  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? activeProfile ?? versions[0] ?? null;
  const baselineInput = useMemo(() => editorToInput(profileToEditor(activeProfile)), [activeProfile]);
  const currentInput = useMemo(() => editorToInput(editor), [editor]);
  const isDirty = JSON.stringify(currentInput) !== JSON.stringify(baselineInput);

  async function handleSave() {
    if (!organizationId) return;
    setSaving(true);
    setSaveError(null);
    const parsed = companyProfileInputSchema.safeParse(editorToInput(editor));
    if (!parsed.success) {
      setValidationErrors(
        parsed.error.issues.map((issue) => `${issue.path.length ? issue.path.join('.') : 'profile'}: ${issue.message}`),
      );
      setSaving(false);
      return;
    }
    setValidationErrors([]);
    try {
      const saved = await createCompanyProfileVersion(organizationId, parsed.data);
      message.success(`Saved version v${saved.version} — Company Brain updates are stored as new revisions.`);
      setReloadToken((v) => v + 1);
    } catch (error) {
      setSaveError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveThreshold() {
    if (!organizationId) return;
    setSavingThreshold(true);
    try {
      const { error } = await supabase.rpc('update_org_score_threshold', {
        p_org: organizationId,
        p_threshold: scoreThreshold,
      });
      if (error) {
        // Fallback: direct update (requires service role or own-org RLS policy)
        const { error: updateError } = await supabase
          .from('organizations')
          .update({ settings: { scoreThreshold } })
          .eq('id', organizationId);
        if (updateError) throw updateError;
      }
      message.success(`Score threshold updated to ${scoreThreshold}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSavingThreshold(false);
    }
  }

  function loadVersionIntoEditor(version: CompanyProfileVersion) {
    setEditor(profileToEditor(version));
    setSelectedVersionId(version.id);
    setValidationErrors([]);
    setSaveError(null);
    message.info(`Loaded v${version.version} into the editor — saving will create a new version.`);
  }

  function updateRule(ruleId: string, updater: (rule: RuleDraft) => RuleDraft) {
    setEditor((current) => ({
      ...current,
      badLeadRules: current.badLeadRules.map((rule) => (rule.id === ruleId ? updater(rule) : rule)),
    }));
  }

  if (!currentOrg) {
    return <Result status="info" title="No workspace yet" subTitle="Join or create a workspace before editing your targeting rules." />;
  }
  if (!canManage) {
    return <Result status="403" title="No access" subTitle="Your current role does not include company_brain.manage." />;
  }

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Settings"
        title="Company Brain"
        subtitle="Define who you sell to, what you prioritize, and what should be rejected before outreach starts."
        extra={
          <Button
            type="primary"
            loading={saving}
            disabled={loading}
            icon={<PlusOutlined />}
            onClick={() => void handleSave()}
          >
            {activeProfile ? 'Save new version' : 'Create first version'}
          </Button>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <MetricCard eyebrow="Active version" value={activeProfile ? `v${activeProfile.version}` : 'Draft'} />
        </Col>
        <Col xs={24} sm={8}>
          <MetricCard eyebrow="Saved versions" value={versions.length} />
        </Col>
        <Col xs={24} sm={8}>
          <MetricCard eyebrow="Priority services" value={parseList(editor.priorityServicesText).length} />
        </Col>
      </Row>

      {loadError && <Alert type="error" showIcon title={loadError} />}
      {saveError && <Alert type="error" showIcon title={saveError} closable onClose={() => setSaveError(null)} />}
      {validationErrors.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title="Fix these before saving"
          description={
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          }
        />
      )}

      <Row gutter={[24, 24]} align="top">
        <Col xs={24} xl={16}>
          <Flex vertical gap={24}>
            <PageSection
              title="Core targeting"
              subtitle="Use commas or one value per line. Priority services must also appear in services."
              extra={
                <Button
                  size="small"
                  disabled={!activeProfile && !selectedVersion}
                  onClick={() => {
                    const version = activeProfile ?? selectedVersion;
                    if (version) loadVersionIntoEditor(version);
                  }}
                >
                  Reset to current version
                </Button>
              }
            >
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <L label="Services">
                    <TextArea
                      rows={4}
                      value={editor.servicesText}
                      onChange={(e) => setEditor((c) => ({ ...c, servicesText: e.target.value }))}
                      placeholder={'Web design\nReact development\nConversion copy'}
                    />
                  </L>
                </Col>
                <Col xs={24} md={12}>
                  <L label="Priority services">
                    <TextArea
                      rows={4}
                      value={editor.priorityServicesText}
                      onChange={(e) => setEditor((c) => ({ ...c, priorityServicesText: e.target.value }))}
                      placeholder={'React development\nConversion copy'}
                    />
                  </L>
                </Col>
                <Col xs={24} md={12}>
                  <L label="Target industries">
                    <TextArea
                      rows={4}
                      value={editor.targetIndustriesText}
                      onChange={(e) => setEditor((c) => ({ ...c, targetIndustriesText: e.target.value }))}
                      placeholder={'SaaS\nFintech\nHealthtech'}
                    />
                  </L>
                </Col>
                <Col xs={24} md={12}>
                  <L label="Target countries">
                    <TextArea
                      rows={4}
                      value={editor.targetCountriesText}
                      onChange={(e) => setEditor((c) => ({ ...c, targetCountriesText: e.target.value }))}
                      placeholder={'United States\nCanada\nUnited Kingdom'}
                    />
                  </L>
                </Col>
                <Col xs={24} md={12}>
                  <L label="Minimum budget">
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      value={editor.minBudget === '' ? null : Number(editor.minBudget)}
                      onChange={(v) => setEditor((c) => ({ ...c, minBudget: v == null ? '' : String(v) }))}
                      placeholder="5000"
                    />
                  </L>
                </Col>
                <Col xs={24} md={12}>
                  <L label="Outreach tone">
                    <Input
                      value={editor.outreachTone}
                      onChange={(e) => setEditor((c) => ({ ...c, outreachTone: e.target.value }))}
                      placeholder="Direct, research-heavy, and low-pressure"
                    />
                  </L>
                </Col>
              </Row>
            </PageSection>

            <PageSection
              title="Opportunity qualification"
              subtitle="Controls when a discovery can be approved and converted into an opportunity."
            >
              <Flex vertical gap={16}>
                <div>
                  <Text strong>Score threshold</Text>
                  <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 12 }}>
                    Discoveries with an AI score below this value cannot be approved unless a company admin overrides it.
                    Default is 60. Raise it to be more selective; lower it to capture more leads.
                  </Paragraph>
                  <Flex gap={12} align="center" wrap>
                    <InputNumber
                      min={0}
                      max={100}
                      style={{ width: 120 }}
                      value={scoreThreshold}
                      onChange={(v) => setScoreThreshold(v ?? 60)}
                      addonAfter="/ 100"
                    />
                    <Button
                      type="primary"
                      loading={savingThreshold}
                      onClick={() => void handleSaveThreshold()}
                    >
                      Save threshold
                    </Button>
                  </Flex>
                </div>
              </Flex>
            </PageSection>

            <PageSection
              title="Ideal customer profile"
              subtitle="This gives downstream ranking and analysis the context they need to explain fit."
            >
              <Flex vertical gap={16}>
                <L label="ICP summary">
                  <TextArea
                    rows={3}
                    value={editor.idealCustomerSummary}
                    onChange={(e) => setEditor((c) => ({ ...c, idealCustomerSummary: e.target.value }))}
                    placeholder="We win with founder-led B2B SaaS teams that need faster pipeline without hiring in-house."
                  />
                </L>
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12}>
                    <L label="Company sizes">
                      <TextArea
                        rows={3}
                        value={editor.idealCustomerCompanySizesText}
                        onChange={(e) => setEditor((c) => ({ ...c, idealCustomerCompanySizesText: e.target.value }))}
                        placeholder={'11-50 employees\n51-200 employees'}
                      />
                    </L>
                  </Col>
                  <Col xs={24} md={12}>
                    <L label="Buyer roles">
                      <TextArea
                        rows={3}
                        value={editor.idealCustomerBuyerRolesText}
                        onChange={(e) => setEditor((c) => ({ ...c, idealCustomerBuyerRolesText: e.target.value }))}
                        placeholder={'Founder\nHead of Marketing\nRevenue Ops'}
                      />
                    </L>
                  </Col>
                  <Col xs={24} md={12}>
                    <L label="Regions">
                      <TextArea
                        rows={3}
                        value={editor.idealCustomerRegionsText}
                        onChange={(e) => setEditor((c) => ({ ...c, idealCustomerRegionsText: e.target.value }))}
                        placeholder={'North America\nWestern Europe'}
                      />
                    </L>
                  </Col>
                  <Col xs={24} md={12}>
                    <L label="Pain points">
                      <TextArea
                        rows={3}
                        value={editor.idealCustomerPainPointsText}
                        onChange={(e) => setEditor((c) => ({ ...c, idealCustomerPainPointsText: e.target.value }))}
                        placeholder={'Low outbound reply rates\nWeak website conversion'}
                      />
                    </L>
                  </Col>
                </Row>
                <L label="Notes">
                  <TextArea
                    rows={3}
                    value={editor.idealCustomerNotes}
                    onChange={(e) => setEditor((c) => ({ ...c, idealCustomerNotes: e.target.value }))}
                    placeholder="Avoid teams looking only for one-off design polish without a growth mandate."
                  />
                </L>
              </Flex>
            </PageSection>

            <PageSection
              title="Bad-lead rules"
              subtitle="Reject poor-fit discoveries early. Website only supports exists / not exists; budget uses numeric comparisons."
              extra={
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setEditor((c) => ({ ...c, badLeadRules: [...c.badLeadRules, createEmptyRule()] }))}
                >
                  Add rule
                </Button>
              }
            >
              <L label="Rule logic">
                <Radio.Group
                  value={editor.badLeadLogic}
                  onChange={(e) => setEditor((c) => ({ ...c, badLeadLogic: e.target.value }))}
                  optionType="button"
                  buttonStyle="solid"
                >
                  {COMPANY_BAD_LEAD_RULE_LOGICS.map((logic) => (
                    <Radio.Button key={logic} value={logic}>
                      {logic === 'any' ? 'Any rule rejects' : 'All rules must match'}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </L>

              <Flex vertical gap={16} style={{ marginTop: 20 }}>
                {editor.badLeadRules.length === 0 && (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No rejection rules yet. Add rules for industries, countries, keywords, company names, budget thresholds, or missing websites."
                  />
                )}

                {editor.badLeadRules.map((rule, index) => {
                  const operators = getOperatorOptions(rule.field);
                  const hidesValue = rule.operator === 'exists' || rule.operator === 'not_exists';
                  return (
                    <Card key={rule.id} size="small" style={{ background: token.colorBgElevated }}>
                      <Flex align="center" justify="space-between" style={{ marginBottom: 12 }}>
                        <Text strong>Rule {index + 1}</Text>
                        <Popconfirm
                          title="Remove this rule?"
                          okText="Remove"
                          okButtonProps={{ danger: true }}
                          onConfirm={() =>
                            setEditor((c) => ({ ...c, badLeadRules: c.badLeadRules.filter((r) => r.id !== rule.id) }))
                          }
                        >
                          <Button type="text" size="small" danger>
                            Remove
                          </Button>
                        </Popconfirm>
                      </Flex>
                      <Row gutter={[12, 12]}>
                        <Col xs={24} md={8}>
                          <L label="Field">
                            <Select
                              style={{ width: '100%' }}
                              value={rule.field}
                              onChange={(nextField: RuleField) => {
                                const normalized = normalizeRule(nextField, rule.operator);
                                updateRule(rule.id, (current) => ({
                                  ...current,
                                  ...normalized,
                                  value:
                                    normalized.operator === 'exists' || normalized.operator === 'not_exists'
                                      ? ''
                                      : current.value,
                                }));
                              }}
                              options={COMPANY_BAD_LEAD_RULE_FIELDS.map((f) => ({ value: f, label: toLabel(f) }))}
                            />
                          </L>
                        </Col>
                        <Col xs={24} md={8}>
                          <L label="Operator">
                            <Select
                              style={{ width: '100%' }}
                              value={rule.operator}
                              onChange={(nextOperator: RuleOperator) =>
                                updateRule(rule.id, (current) => ({
                                  ...current,
                                  operator: nextOperator,
                                  value: nextOperator === 'exists' || nextOperator === 'not_exists' ? '' : current.value,
                                }))
                              }
                              options={operators.map((o) => ({ value: o, label: toLabel(o) }))}
                            />
                          </L>
                        </Col>
                        <Col xs={24} md={8}>
                          <L label={getRuleValueLabel(rule)}>
                            {hidesValue ? (
                              <Input disabled placeholder="No value required" />
                            ) : rule.operator === 'in' ? (
                              <TextArea
                                rows={2}
                                value={rule.value}
                                onChange={(e) => updateRule(rule.id, (c) => ({ ...c, value: e.target.value }))}
                                placeholder={getRulePlaceholder(rule)}
                              />
                            ) : rule.field === 'budget' ? (
                              <InputNumber
                                style={{ width: '100%' }}
                                min={0}
                                value={rule.value === '' ? null : Number(rule.value)}
                                onChange={(v) => updateRule(rule.id, (c) => ({ ...c, value: v == null ? '' : String(v) }))}
                                placeholder={getRulePlaceholder(rule)}
                              />
                            ) : (
                              <Input
                                value={rule.value}
                                onChange={(e) => updateRule(rule.id, (c) => ({ ...c, value: e.target.value }))}
                                placeholder={getRulePlaceholder(rule)}
                              />
                            )}
                          </L>
                        </Col>
                      </Row>
                    </Card>
                  );
                })}
              </Flex>
            </PageSection>
          </Flex>
        </Col>

        <Col xs={24} xl={8}>
          <Flex vertical gap={24}>
            <PageSection
              title="Version history"
              subtitle="Loading an older version into the editor never mutates history; saving always creates a new revision."
            >
              {loading && versions.length === 0 ? (
                <Skeleton active paragraph={{ rows: 4 }} />
              ) : versions.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No saved versions yet. The first save creates v1."
                />
              ) : (
                <Flex vertical gap={12}>
                  {versions.map((version) => {
                    const selected = version.id === selectedVersionId;
                    return (
                      <Card
                        key={version.id}
                        size="small"
                        hoverable
                        onClick={() => setSelectedVersionId(version.id)}
                        style={{
                          borderColor: selected ? token.colorPrimary : token.colorBorderSecondary,
                          background: selected ? 'rgba(61,220,151,0.10)' : undefined,
                        }}
                      >
                        <Flex align="center" justify="space-between" gap={8} wrap>
                          <Flex align="center" gap={6}>
                            <Tag variant="filled">v{version.version}</Tag>
                            {version.isActive && (
                              <Tag color="success" variant="filled">
                                Active
                              </Tag>
                            )}
                          </Flex>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatDateTime(version.createdAt)}
                          </Text>
                        </Flex>
                        <Paragraph style={{ margin: '8px 0 4px' }}>{formatVersionSummary(version)}</Paragraph>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {version.outreachTone || 'No outreach tone saved'}
                        </Text>
                        <div style={{ marginTop: 10 }}>
                          <Button
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              loadVersionIntoEditor(version);
                            }}
                          >
                            Load into editor
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </Flex>
              )}
            </PageSection>

            <ScoringStrategiesList />

            <PageSection
              title="Snapshot preview"
              subtitle="This summary reflects the selected saved version, not unsaved draft edits."
            >
              {!selectedVersion ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Select a version to summarize it here." />
              ) : (
                <Flex vertical gap={16}>
                  <Flex align="center" justify="space-between" gap={8} wrap>
                    <Title level={5} style={{ margin: 0 }}>
                      Version v{selectedVersion.version}
                    </Title>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatDateTime(selectedVersion.createdAt)}
                    </Text>
                  </Flex>
                  <Descriptions
                    size="small"
                    column={1}
                    bordered
                    items={[
                      { key: 'budget', label: 'Min budget', children: formatBudget(selectedVersion.minBudget) },
                      { key: 'rules', label: 'Rejection rules', children: selectedVersion.badLeadRules.rules.length },
                      { key: 'services', label: 'Services', children: selectedVersion.services.join(', ') || 'None' },
                      { key: 'priority', label: 'Priority', children: selectedVersion.priorityServices.join(', ') || 'None' },
                      { key: 'industries', label: 'Industries', children: selectedVersion.targetIndustries.join(', ') || 'None' },
                      { key: 'countries', label: 'Countries', children: selectedVersion.targetCountries.join(', ') || 'None' },
                    ]}
                  />
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                      ICP summary
                    </Text>
                    <Paragraph style={{ marginTop: 6, whiteSpace: 'pre-wrap' }} type={selectedVersion.idealCustomer.summary ? undefined : 'secondary'}>
                      {selectedVersion.idealCustomer.summary || 'No summary saved'}
                    </Paragraph>
                  </div>
                </Flex>
              )}
            </PageSection>
          </Flex>
        </Col>
      </Row>

      <SettingsSaveBar
        dirty={isDirty}
        saving={saving}
        message="You have unsaved Company Brain changes. Saving creates a new version and keeps earlier targeting history intact."
        onReset={() => {
          const version = activeProfile ?? selectedVersion;
          setEditor(profileToEditor(version));
          setValidationErrors([]);
          setSaveError(null);
        }}
        onSave={() => void handleSave()}
        saveLabel={activeProfile ? 'Save new version' : 'Create first version'}
      />
    </Flex>
  );
}
