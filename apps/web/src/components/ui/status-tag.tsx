
import { Tag } from 'antd';
import type {
  DiscoveryStatus,
  LeadHuntingClassification,
  LeadStage,
  OpportunityStatus,
  Priority,
  RawPostStatus,
  TaskStatus,
} from '@radar/contracts';

const DISCOVERY_STATUS_COLOR: Record<DiscoveryStatus, string> = {
  new: 'blue',
  processing: 'gold',
  analyzed: 'cyan',
  reviewed: 'geekblue',
  approved: 'green',
  ignored: 'default',
  converted: 'purple',
};

const OPPORTUNITY_STATUS_COLOR: Record<OpportunityStatus, string> = {
  open: 'blue',
  qualified: 'green',
  promoted_to_lead: 'purple',
  ignored: 'default',
  expired: 'volcano',
  archived: 'default',
};

const LEAD_STAGE_COLOR: Record<LeadStage, string> = {
  new: 'blue',
  contacted: 'cyan',
  reply_received: 'geekblue',
  meeting_scheduled: 'gold',
  proposal_sent: 'orange',
  negotiation: 'purple',
  won: 'success',
  lost: 'error',
  on_hold: 'default',
};

const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  open: 'processing',
  done: 'success',
  cancelled: 'default',
};

const JOB_STATUS_COLOR: Record<string, string> = {
  queued: 'default',
  running: 'processing',
  retrying: 'processing',
  completed: 'success',
  failed: 'error',
  cancelled: 'error',
};

const PRIORITY_COLOR: Record<'critical' | 'high' | 'medium' | 'low', string> = {
  critical: 'error',
  high: 'success',
  medium: 'warning',
  low: 'default',
};

const URGENCY_COLOR: Record<'urgent' | 'soon' | 'later' | 'none', string> = {
  urgent: 'error',
  soon: 'warning',
  later: 'processing',
  none: 'default',
};

const RAW_POST_STATUS_COLOR: Record<RawPostStatus, string> = {
  raw_captured: 'default',
  duplicate_linked: 'default',
  queued_for_research: 'processing',
  researching: 'warning',
  provider_post_enriched: 'processing',
  person_resolved: 'cyan',
  company_resolved: 'cyan',
  website_found: 'cyan',
  website_researched: 'cyan',
  email_checked: 'cyan',
  management_found: 'cyan',
  country_resolved: 'cyan',
  evidence_built: 'blue',
  ai_classified: 'geekblue',
  qualified_lead: 'success',
  needs_review: 'gold',
  archived: 'default',
  rejected: 'error',
  failed: 'error',
  cancelled: 'error',
};

const LEAD_HUNTING_CLASSIFICATION_COLOR: Record<LeadHuntingClassification, string> = {
  actual_requirement: 'success',
  hiring_requirement: 'processing',
  service_needed: 'success',
  vendor_needed: 'success',
  partnership_opportunity: 'processing',
  funding_signal: 'cyan',
  expansion_signal: 'cyan',
  complaint_or_pain_signal: 'warning',
  buying_intent_signal: 'success',
  informational_post: 'default',
  personal_branding_post: 'default',
  news_update: 'default',
  promotion_only: 'default',
  job_seeker_post: 'default',
  irrelevant: 'default',
  spam: 'error',
};

function toLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function DiscoveryStatusTag({ status }: { status: DiscoveryStatus }) {
  return (
    <Tag color={DISCOVERY_STATUS_COLOR[status]} variant="filled" style={{ textTransform: 'capitalize' }}>
      {toLabel(status)}
    </Tag>
  );
}

export function OpportunityStatusTag({ status }: { status: OpportunityStatus }) {
  return (
    <Tag color={OPPORTUNITY_STATUS_COLOR[status]} variant="filled" style={{ textTransform: 'capitalize' }}>
      {toLabel(status)}
    </Tag>
  );
}

export function LeadStageTag({ stage }: { stage: LeadStage }) {
  return (
    <Tag color={LEAD_STAGE_COLOR[stage]} variant="filled" style={{ textTransform: 'capitalize' }}>
      {toLabel(stage)}
    </Tag>
  );
}

export function TaskStatusTag({ status }: { status: TaskStatus }) {
  return (
    <Tag color={TASK_STATUS_COLOR[status]} variant="filled" style={{ textTransform: 'capitalize' }}>
      {toLabel(status)}
    </Tag>
  );
}

export function JobStatusTag({ status }: { status: string }) {
  return (
    <Tag color={JOB_STATUS_COLOR[status] ?? 'default'} variant="filled" style={{ textTransform: 'capitalize' }}>
      {toLabel(status)}
    </Tag>
  );
}

export function PriorityTag({ priority }: { priority: Priority }) {
  return (
    <Tag color={PRIORITY_COLOR[priority]} variant="filled">
      {toLabel(priority)}
    </Tag>
  );
}

export function UrgencyTag({ urgency }: { urgency: 'urgent' | 'soon' | 'later' | 'none' }) {
  return (
    <Tag color={URGENCY_COLOR[urgency]} variant="filled">
      {toLabel(urgency)}
    </Tag>
  );
}

export function ScoreTag({
  score,
  isBadLead = false,
}: {
  score: number;
  isBadLead?: boolean;
}) {
  const color = isBadLead ? 'error' : score >= 80 ? 'success' : score >= 60 ? 'processing' : score >= 40 ? 'warning' : 'default';

  return (
    <Tag color={color} variant="filled">
      Score {score}
    </Tag>
  );
}

export function SourceTag({ source }: { source: string }) {
  return <Tag bordered>{toLabel(source)}</Tag>;
}

export function RawPostStatusTag({ status }: { status: RawPostStatus }) {
  return (
    <Tag color={RAW_POST_STATUS_COLOR[status]} variant="filled">
      {toLabel(status)}
    </Tag>
  );
}

export function LeadHuntingClassificationTag({ classification }: { classification: LeadHuntingClassification }) {
  return (
    <Tag color={LEAD_HUNTING_CLASSIFICATION_COLOR[classification]} variant="filled">
      {toLabel(classification)}
    </Tag>
  );
}
