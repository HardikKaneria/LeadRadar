/**
 * P4-08 + P5-06 QA — contract validation for the Phase 4 surface (opportunities, companies/contacts,
 * relationship graph, timeline) and the Phase 5 surface (lead pipeline + follow-up tasks). These
 * cover the shared zod DTOs that web + the API both rely on.
 *
 * NOTE: the *behavioral* guards live in SECURITY DEFINER SQL RPCs (single source) and need a live
 * Postgres / pgTAP to exercise — for Phase 4 the convert threshold + dedup/merge + edge/entity
 * checks, and for Phase 5 the promote idempotency + close-outcome gate + the "no active lead without
 * an open task" invariant (the ensure-follow-up trigger and the complete/cancel last-task guard).
 * Those are intentionally out of scope for this JS suite — tracked as [P4-08-DB] / [P5-06-DB].
 */

import {
  addNoteSchema,
  cancelTaskSchema,
  closeLeadSchema,
  companyFilterSchema,
  completeTaskSchema,
  convertDiscoverySchema,
  createTaskSchema,
  extensionBatchIngestionSchema,
  leadFilterSchema,
  mergeEntitiesSchema,
  opportunityFilterSchema,
  promoteOpportunitySchema,
  reassignTaskSchema,
  recordAttachmentSchema,
  rescheduleTaskSchema,
  taskQueueSchema,
  updateLeadStageSchema,
  updateOpportunityStatusSchema,
  upsertCompanySchema,
  upsertContactSchema,
  upsertRelationshipEdgeSchema,
} from './dto';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';
const ISO = '2026-06-25T10:00:00.000Z';

describe('opportunityFilterSchema', () => {
  it('applies defaults for page/pageSize/sort', () => {
    expect(opportunityFilterSchema.parse({})).toEqual({ page: 1, pageSize: 25, sort: 'score' });
  });

  it('keeps valid status/priority/sort and the search term', () => {
    const parsed = opportunityFilterSchema.parse({
      status: ['open', 'qualified'],
      priority: ['high'],
      search: '  rebuild ',
      sort: 'heat',
    });
    expect(parsed.status).toEqual(['open', 'qualified']);
    expect(parsed.sort).toBe('heat');
    expect(parsed.search).toBe('rebuild');
  });

  it('rejects unknown status, sort, and an over-large pageSize', () => {
    expect(opportunityFilterSchema.safeParse({ status: ['won'] }).success).toBe(false);
    expect(opportunityFilterSchema.safeParse({ sort: 'alphabetical' }).success).toBe(false);
    expect(opportunityFilterSchema.safeParse({ pageSize: 1000 }).success).toBe(false);
  });
});

describe('updateOpportunityStatusSchema', () => {
  it('accepts 1..200 ids and a settable status', () => {
    expect(updateOpportunityStatusSchema.parse({ ids: [UUID], status: 'qualified' }).status).toBe('qualified');
  });

  it('rejects an empty id list, a non-uuid id, and a system status', () => {
    expect(updateOpportunityStatusSchema.safeParse({ ids: [], status: 'open' }).success).toBe(false);
    expect(updateOpportunityStatusSchema.safeParse({ ids: ['nope'], status: 'open' }).success).toBe(false);
    // promoted_to_lead/expired are system states, not operator-settable.
    expect(updateOpportunityStatusSchema.safeParse({ ids: [UUID], status: 'promoted_to_lead' }).success).toBe(false);
  });
});

describe('convertDiscoverySchema', () => {
  it('defaults force to false and requires a uuid discovery', () => {
    expect(convertDiscoverySchema.parse({ discoveryId: UUID })).toEqual({ discoveryId: UUID, force: false });
    expect(convertDiscoverySchema.safeParse({ discoveryId: 'x' }).success).toBe(false);
  });
});

describe('company & contact schemas', () => {
  it('companyFilterSchema defaults sort to name', () => {
    expect(companyFilterSchema.parse({}).sort).toBe('name');
  });

  it('upsertCompanySchema requires a name and caps the tech stack', () => {
    expect(upsertCompanySchema.parse({ name: 'Acme' }).name).toBe('Acme');
    expect(upsertCompanySchema.safeParse({ name: '' }).success).toBe(false);
    expect(upsertCompanySchema.safeParse({ name: 'Acme', techStack: Array(101).fill('x') }).success).toBe(false);
  });

  it('upsertContactSchema validates email + linkedin url shapes', () => {
    expect(upsertContactSchema.safeParse({ name: 'Ada', email: 'not-an-email' }).success).toBe(false);
    expect(upsertContactSchema.safeParse({ name: 'Ada', linkedinUrl: 'not a url' }).success).toBe(false);
    expect(upsertContactSchema.parse({ name: 'Ada', email: 'ada@example.com' }).email).toBe('ada@example.com');
  });

  it('mergeEntitiesSchema requires two uuids', () => {
    expect(mergeEntitiesSchema.parse({ primaryId: UUID, duplicateId: UUID_2 }).primaryId).toBe(UUID);
    expect(mergeEntitiesSchema.safeParse({ primaryId: UUID, duplicateId: 'dup' }).success).toBe(false);
  });
});

describe('upsertRelationshipEdgeSchema', () => {
  const base = {
    edgeType: 'works_at' as const,
    source: { type: 'contact' as const, id: UUID },
    target: { type: 'company' as const, id: UUID_2 },
  };

  it('accepts a valid edge with an optional bounded weight', () => {
    expect(upsertRelationshipEdgeSchema.parse({ ...base, weight: 0.8 }).weight).toBe(0.8);
    expect(upsertRelationshipEdgeSchema.parse(base).edgeType).toBe('works_at');
  });

  it('rejects an unknown edge/node type and a negative weight', () => {
    expect(upsertRelationshipEdgeSchema.safeParse({ ...base, edgeType: 'rivals' }).success).toBe(false);
    expect(
      upsertRelationshipEdgeSchema.safeParse({ ...base, source: { type: 'lead', id: UUID } }).success,
    ).toBe(false);
    expect(upsertRelationshipEdgeSchema.safeParse({ ...base, weight: -1 }).success).toBe(false);
  });
});

describe('timeline schemas', () => {
  const target = { entityType: 'opportunity' as const, entityId: UUID };

  it('addNoteSchema trims a non-empty body and defaults nothing else', () => {
    expect(addNoteSchema.parse({ ...target, body: '  hello  ' }).body).toBe('hello');
    expect(addNoteSchema.safeParse({ ...target, body: '   ' }).success).toBe(false);
    expect(addNoteSchema.safeParse({ entityType: 'opportunity', entityId: 'x', body: 'hi' }).success).toBe(false);
  });

  it('recordAttachmentSchema requires bucket/path/fileName and a non-negative size', () => {
    const ok = recordAttachmentSchema.parse({
      ...target,
      bucket: 'attachments',
      path: 'org/file.pdf',
      fileName: 'file.pdf',
      sizeBytes: 1024,
    });
    expect(ok.fileName).toBe('file.pdf');
    expect(
      recordAttachmentSchema.safeParse({ ...target, bucket: 'b', path: '', fileName: 'f' }).success,
    ).toBe(false);
    expect(
      recordAttachmentSchema.safeParse({ ...target, bucket: 'b', path: 'p', fileName: 'f', sizeBytes: -5 })
        .success,
    ).toBe(false);
  });
});

// ── Phase 5 · Lead pipeline (P5-01) + follow-up tasks (P5-02) ──

describe('leadFilterSchema', () => {
  it('defaults page/pageSize and sorts by most-recently-updated', () => {
    expect(leadFilterSchema.parse({})).toEqual({ page: 1, pageSize: 25, sort: 'updated' });
  });

  it('keeps valid stage/priority/sort and trims the search term', () => {
    const parsed = leadFilterSchema.parse({
      stage: ['contacted', 'negotiation'],
      priority: ['high'],
      search: '  acme ',
      sort: 'score',
    });
    expect(parsed.stage).toEqual(['contacted', 'negotiation']);
    expect(parsed.sort).toBe('score');
    expect(parsed.search).toBe('acme');
  });

  it('rejects an unknown stage, an unknown sort, and an over-large pageSize', () => {
    expect(leadFilterSchema.safeParse({ stage: ['promoted'] }).success).toBe(false);
    expect(leadFilterSchema.safeParse({ sort: 'heat' }).success).toBe(false);
    expect(leadFilterSchema.safeParse({ pageSize: 1000 }).success).toBe(false);
  });
});

describe('updateLeadStageSchema', () => {
  it('accepts 1..200 ids and an operator-settable stage', () => {
    expect(updateLeadStageSchema.parse({ ids: [UUID], stage: 'contacted' }).stage).toBe('contacted');
  });

  it('rejects an empty id list, a non-uuid id, and the terminal won/lost stages', () => {
    expect(updateLeadStageSchema.safeParse({ ids: [], stage: 'new' }).success).toBe(false);
    expect(updateLeadStageSchema.safeParse({ ids: ['nope'], stage: 'new' }).success).toBe(false);
    // won/lost are terminal — they go through close_lead, not a direct stage set.
    expect(updateLeadStageSchema.safeParse({ ids: [UUID], stage: 'won' }).success).toBe(false);
    expect(updateLeadStageSchema.safeParse({ ids: [UUID], stage: 'lost' }).success).toBe(false);
  });
});

describe('promoteOpportunitySchema', () => {
  it('requires a uuid opportunity and accepts an optional owner', () => {
    expect(promoteOpportunitySchema.parse({ opportunityId: UUID, ownerId: UUID_2 }).ownerId).toBe(UUID_2);
    expect(promoteOpportunitySchema.parse({ opportunityId: UUID }).opportunityId).toBe(UUID);
    expect(promoteOpportunitySchema.safeParse({ opportunityId: 'x' }).success).toBe(false);
    expect(promoteOpportunitySchema.safeParse({ opportunityId: UUID, ownerId: 'x' }).success).toBe(false);
  });
});

describe('closeLeadSchema', () => {
  it('requires a uuid lead and a won/lost outcome, trimming the reason', () => {
    expect(closeLeadSchema.parse({ leadId: UUID, outcome: 'won', reason: '  budget fit ' }).reason).toBe('budget fit');
    expect(closeLeadSchema.parse({ leadId: UUID, outcome: 'lost' }).outcome).toBe('lost');
  });

  it('rejects a non-uuid lead and any outcome other than won/lost', () => {
    expect(closeLeadSchema.safeParse({ leadId: 'x', outcome: 'won' }).success).toBe(false);
    expect(closeLeadSchema.safeParse({ leadId: UUID, outcome: 'on_hold' }).success).toBe(false);
  });
});

describe('taskQueueSchema', () => {
  it('defaults to the today queue with page/pageSize', () => {
    expect(taskQueueSchema.parse({})).toEqual({ queue: 'today', page: 1, pageSize: 25 });
  });

  it('accepts each queue tab and rejects an unknown one', () => {
    for (const queue of ['overdue', 'today', 'upcoming', 'assigned', 'all'] as const) {
      expect(taskQueueSchema.parse({ queue }).queue).toBe(queue);
    }
    expect(taskQueueSchema.safeParse({ queue: 'someday' }).success).toBe(false);
  });
});

describe('task mutation schemas', () => {
  it('createTaskSchema requires lead + title and defaults priority to medium', () => {
    const parsed = createTaskSchema.parse({ leadId: UUID, title: 'Follow up' });
    expect(parsed.priority).toBe('medium');
    expect(createTaskSchema.safeParse({ leadId: UUID, title: '' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ leadId: 'x', title: 'Follow up' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ leadId: UUID, title: 'Follow up', dueAt: 'soon' }).success).toBe(false);
  });

  it('rescheduleTaskSchema requires a uuid task and an ISO due date', () => {
    expect(rescheduleTaskSchema.parse({ taskId: UUID, dueAt: ISO }).dueAt).toBe(ISO);
    expect(rescheduleTaskSchema.safeParse({ taskId: UUID, dueAt: 'tomorrow' }).success).toBe(false);
  });

  it('reassignTaskSchema accepts a uuid assignee or an explicit null (unassign)', () => {
    expect(reassignTaskSchema.parse({ taskId: UUID, assignedTo: UUID_2 }).assignedTo).toBe(UUID_2);
    expect(reassignTaskSchema.parse({ taskId: UUID, assignedTo: null }).assignedTo).toBeNull();
    expect(reassignTaskSchema.safeParse({ taskId: UUID, assignedTo: 'x' }).success).toBe(false);
  });

  it('completeTaskSchema requires a uuid task and validates the optional follow-up shape', () => {
    expect(completeTaskSchema.parse({ taskId: UUID }).taskId).toBe(UUID);
    const withFollowUp = completeTaskSchema.parse({
      taskId: UUID,
      followUpTitle: 'Next touch',
      followUpDueAt: ISO,
      followUpPriority: 'high',
    });
    expect(withFollowUp.followUpPriority).toBe('high');
    expect(completeTaskSchema.safeParse({ taskId: 'x' }).success).toBe(false);
    expect(completeTaskSchema.safeParse({ taskId: UUID, followUpDueAt: 'later' }).success).toBe(false);
  });

  it('cancelTaskSchema requires a uuid task', () => {
    expect(cancelTaskSchema.parse({ taskId: UUID }).taskId).toBe(UUID);
    expect(cancelTaskSchema.safeParse({ taskId: 'x' }).success).toBe(false);
  });
});

describe('extensionBatchIngestionSchema', () => {
  it('accepts the richer LinkedIn raw-post fields and defaults captureMode', () => {
    const parsed = extensionBatchIngestionSchema.parse({
      source: 'linkedin',
      capturedUrl: 'https://www.linkedin.com/search/results/content/?keywords=shopify',
      capturedAt: ISO,
      searchQuery: 'Shopify developer hiring',
      parserVersion: 'linkedin-visible-posts-v2',
      items: [
        {
          title: 'Looking for a Shopify developer',
          description: 'Visible post text',
          postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:1',
          postText: 'Looking for a Shopify developer for our D2C brand.',
          postOwnerName: 'Rahul Shah',
          postOwnerHeadline: 'Founder at GrowthLabs',
          postOwnerProfileUrl: 'https://www.linkedin.com/in/rahul-shah',
          visibleCompanyName: 'GrowthLabs',
          visibleCompanyUrl: 'https://www.linkedin.com/company/growthlabs',
          postDate: '2026-06-28',
          reactionCount: 32,
          commentCount: 14,
          repostCount: 2,
          raw: {},
        },
      ],
    });

    expect(parsed.captureMode).toBe('visible_posts');
    expect(parsed.items[0]?.postOwnerName).toBe('Rahul Shah');
    expect(parsed.items[0]?.reactionCount).toBe(32);
  });
});
