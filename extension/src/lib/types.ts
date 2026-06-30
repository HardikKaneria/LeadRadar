export const SUPPORTED_SOURCES = ['linkedin', 'upwork', 'freelancer', 'website'] as const;
export type SupportedSource = (typeof SUPPORTED_SOURCES)[number];
export const EXTENSION_CAPTURE_MODES = ['visible_posts'] as const;
export type ExtensionCaptureMode = (typeof EXTENSION_CAPTURE_MODES)[number];

export interface ExtensionCaptureItem {
  title?: string;
  description?: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  url?: string;
  country?: string;
  budgetHint?: string | number;
  postUrl?: string;
  postText?: string;
  postOwnerName?: string;
  postOwnerHeadline?: string;
  postOwnerProfileUrl?: string;
  visibleCompanyName?: string;
  visibleCompanyUrl?: string;
  postDate?: string;
  reactionCount?: number;
  commentCount?: number;
  repostCount?: number;
  mediaText?: string;
  raw: Record<string, unknown>;
}

export interface ExtensionBatchPayload {
  source: SupportedSource;
  capturedUrl: string;
  capturedAt: string;
  captureMode?: ExtensionCaptureMode;
  searchQuery?: string;
  parserVersion: string;
  items: ExtensionCaptureItem[];
}

export interface CaptureResult {
  ok: boolean;
  cancelled?: boolean;
  payload?: ExtensionBatchPayload;
  error?: string;
}

export interface QueuedBatch {
  idempotencyKey: string;
  payload: ExtensionBatchPayload;
  queuedAt: string;
}

export interface ExtensionConfig {
  apiBaseUrl: string;
  captureToken: string;
  workspaceName: string;
  queuedBatches: QueuedBatch[];
  lastStatus: {
    kind: 'idle' | 'success' | 'queued' | 'error';
    message: string;
    batchId?: string;
    jobId?: string;
    at: string;
  } | null;
}

export interface CaptureRequestMessage {
  type: 'radar:capture';
}

export interface PopupCommandMessage {
  type: 'radar:get-state' | 'radar:retry-queue' | 'radar:capture-now';
}

export interface AuthorizeMessage {
  type: 'radar:authorize';
  token: string;
  apiBaseUrl: string;
  workspaceName: string;
}
