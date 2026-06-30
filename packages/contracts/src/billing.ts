import { z } from 'zod';

export const BillingPlanSchema = z.object({
  id: z.string().uuid(),
  providerProductId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  monthlyPrice: z.number(),
  features: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type BillingPlanDto = z.infer<typeof BillingPlanSchema>;

export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  planId: z.string().uuid(),
  providerSubscriptionId: z.string().nullable(),
  status: z.enum(['active', 'past_due', 'canceled']),
  currentPeriodEnd: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SubscriptionDto = z.infer<typeof SubscriptionSchema>;

export const UsageLimitSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  resourceType: z.string(),
  maxValue: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UsageLimitDto = z.infer<typeof UsageLimitSchema>;

export const BillingEventSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  type: z.string(),
  payload: z.record(z.any()),
  processed: z.boolean(),
  createdAt: z.string().datetime(),
});

export type BillingEventDto = z.infer<typeof BillingEventSchema>;
