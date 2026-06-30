/**
 * Default **free-first** task routes (doc 14 §14.9). These are the in-code seed defaults; the
 * authoritative, Master-Admin-editable routes live in `ai_task_routes` (P3-13) and override
 * these at runtime. Deterministic-only processes (bad-lead filter, scoring v1, forecasting v1)
 * never call a model and have no route here.
 */

import type { AiTaskType, TaskRoute } from './types';

export const DEFAULT_TASK_ROUTES: Record<AiTaskType, TaskRoute> = {
  opportunity_analyzer: {
    taskType: 'opportunity_analyzer',
    attempts: [
      { provider: 'gemini', model: 'gemini-1.5-flash' },
      { provider: 'groq', model: 'llama-3.1-8b-instant' },
    ],
    requiresJson: true,
    temperature: 0.2,
  },
  action_planner: {
    taskType: 'action_planner',
    attempts: [
      { provider: 'groq', model: 'llama-3.1-8b-instant' },
      { provider: 'gemini', model: 'gemini-1.5-flash' },
    ],
    requiresJson: true,
    temperature: 0.3,
  },
  company_research: {
    taskType: 'company_research',
    attempts: [
      { provider: 'gemini', model: 'gemini-1.5-flash' },
      { provider: 'groq', model: 'llama-3.1-8b-instant' },
    ],
    temperature: 0.4,
  },
  post_research_classifier: {
    taskType: 'post_research_classifier',
    attempts: [
      { provider: 'gemini', model: 'gemini-1.5-flash' },
      { provider: 'groq', model: 'llama-3.1-8b-instant' },
    ],
    requiresJson: true,
    temperature: 0.2,
  },
  archive_classifier: {
    taskType: 'archive_classifier',
    attempts: [
      { provider: 'gemini', model: 'gemini-1.5-flash' },
      { provider: 'groq', model: 'llama-3.1-8b-instant' },
    ],
    requiresJson: true,
    temperature: 0.2,
  },
  lead_quality_scorer: {
    taskType: 'lead_quality_scorer',
    attempts: [
      { provider: 'gemini', model: 'gemini-1.5-flash' },
      { provider: 'groq', model: 'llama-3.1-8b-instant' },
    ],
    requiresJson: true,
    temperature: 0.1,
  },
  sales_message: {
    taskType: 'sales_message',
    attempts: [
      { provider: 'gemini', model: 'gemini-1.5-flash' },
      { provider: 'groq', model: 'llama-3.1-8b-instant' },
    ],
    temperature: 0.7,
  },
  follow_up_message: {
    taskType: 'follow_up_message',
    attempts: [{ provider: 'groq', model: 'llama-3.1-8b-instant' }],
    temperature: 0.7,
  },
  conversation_summary: {
    taskType: 'conversation_summary',
    attempts: [{ provider: 'groq', model: 'llama-3.1-8b-instant' }],
    temperature: 0.2,
  },
  proposal_generator: {
    taskType: 'proposal_generator',
    attempts: [
      { provider: 'gemini', model: 'gemini-1.5-pro' },
      { provider: 'gemini', model: 'gemini-1.5-flash' },
    ],
    temperature: 0.5,
  },
  meeting_prep: {
    taskType: 'meeting_prep',
    attempts: [{ provider: 'groq', model: 'llama-3.1-8b-instant' }],
    temperature: 0.4,
  },
  next_action: {
    taskType: 'next_action',
    attempts: [{ provider: 'groq', model: 'llama-3.1-8b-instant' }],
    requiresJson: true,
    temperature: 0.2,
  },
  embedding: {
    taskType: 'embedding',
    attempts: [{ provider: 'gemini', model: 'text-embedding-004' }],
    requiresEmbedding: true,
  },
  learning_summary: {
    taskType: 'learning_summary',
    attempts: [
      { provider: 'gemini', model: 'gemini-1.5-flash' },
      { provider: 'groq', model: 'llama-3.1-8b-instant' },
    ],
    temperature: 0.3,
  },
};
