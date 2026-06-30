import {
  buildProposalPrompt,
  generateProposal,
  parseProposalOutput,
  renderProposalMarkdown,
  type ProposalDraft,
  type ProposalInput,
} from './proposal';
import { AIService } from './service';
import { FakeProvider } from './providers/fake';
import type { AiCallContext, TaskRoute } from './types';

const ctx: AiCallContext = { taskType: 'proposal_generator', organizationId: 'org-1', userId: 'user-1' };
const route: TaskRoute = {
  taskType: 'proposal_generator',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};

const input: ProposalInput = {
  entityTitle: 'Website rebuild for Acme',
  entityKind: 'opportunity',
  companyName: 'Acme',
  services: ['Web design', 'SEO'],
  tone: 'confident',
  value: 12000,
  currency: 'USD',
  context: 'Wants a faster marketing site.',
};

const draft: ProposalDraft = {
  title: 'Acme Marketing Site Rebuild',
  summary: 'A faster, modern marketing site.',
  sections: [
    { heading: 'Approach', body: 'Rebuild on a modern stack.' },
    { heading: 'Timeline', body: '6 weeks.' },
  ],
  pricingNote: 'Fixed fee, 50% upfront.',
};

function proposalService(responder: () => string): AIService {
  return new AIService({ providers: [new FakeProvider({ responder })], routes: { proposal_generator: route } });
}

describe('parseProposalOutput', () => {
  it('cleans fields and drops malformed sections', () => {
    const out = parseProposalOutput({
      title: '  Plan ',
      summary: ' Do the thing ',
      sections: [
        { heading: 'A', body: 'a' },
        { heading: '', body: 'skip' },
        { heading: 'B' },
        'nope',
      ],
      pricingNote: '  $5k ',
    });
    expect(out.title).toBe('Plan');
    expect(out.sections).toEqual([{ heading: 'A', body: 'a' }]);
    expect(out.pricingNote).toBe('$5k');
  });

  it('defaults pricingNote to null', () => {
    const out = parseProposalOutput({ title: 'T', summary: 'S', sections: [{ heading: 'H', body: 'B' }] });
    expect(out.pricingNote).toBeNull();
  });

  it('throws when title/summary/sections are missing or the input is not an object', () => {
    expect(() => parseProposalOutput({ summary: 'S', sections: [{ heading: 'H', body: 'B' }] })).toThrow(/title/);
    expect(() => parseProposalOutput({ title: 'T', sections: [{ heading: 'H', body: 'B' }] })).toThrow(/summary/);
    expect(() => parseProposalOutput({ title: 'T', summary: 'S', sections: [] })).toThrow(/section/);
    expect(() => parseProposalOutput('nope')).toThrow(/JSON object/);
  });
});

describe('buildProposalPrompt', () => {
  it('includes the entity, offered services, value, and the JSON schema', () => {
    const prompt = buildProposalPrompt(input);
    expect(prompt).toContain('opportunity "Website rebuild for Acme"');
    expect(prompt).toContain('Services we offer: Web design, SEO');
    expect(prompt).toContain('Target value: USD 12000');
    expect(prompt).toContain('"pricingNote": string | null');
  });
});

describe('renderProposalMarkdown', () => {
  it('renders title, summary, sections, and a pricing block', () => {
    const md = renderProposalMarkdown(draft);
    expect(md).toContain('# Acme Marketing Site Rebuild');
    expect(md).toContain('## Approach');
    expect(md).toContain('## Pricing');
    expect(md.endsWith('\n')).toBe(true);
  });
});

describe('generateProposal', () => {
  it('returns the cleaned draft from the recorded response', async () => {
    const out = await generateProposal(proposalService(() => JSON.stringify(draft)), ctx, input);
    expect(out).toEqual(draft);
  });

  it('repairs a non-JSON first response then parses the retry', async () => {
    let calls = 0;
    const ai = proposalService(() => {
      calls += 1;
      return calls === 1 ? 'Here is your proposal: ...' : JSON.stringify(draft);
    });
    const out = await generateProposal(ai, ctx, input);
    expect(out).toEqual(draft);
    expect(calls).toBe(2);
  });
});
