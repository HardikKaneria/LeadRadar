import { z } from 'zod';

export const INTEGRATION_TYPES = [
  'ai_provider',
  'email',
  'calendar',
  'storage',
  'webhook',
  'extension'
] as const;

export const INTEGRATION_STATUSES = ['connected', 'disconnected', 'error'] as const;

export const IntegrationAccountSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  provider: z.string(),
  type: z.enum(INTEGRATION_TYPES),
  status: z.enum(INTEGRATION_STATUSES),
  settings: z.record(z.any()).default({}),
  connectedBy: z.string().uuid().nullable().optional(),
  connectedAt: z.string().datetime().nullable().optional(),
  lastCheckedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type IntegrationAccountDto = z.infer<typeof IntegrationAccountSchema>;

export const ConnectIntegrationSchema = z.object({
  provider: z.string().min(1),
  type: z.enum(INTEGRATION_TYPES),
  credentials: z.record(z.any()),
  settings: z.record(z.any()).optional().default({}),
});

export type ConnectIntegrationDto = z.infer<typeof ConnectIntegrationSchema>;
