import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  assistantAdviceSchema,
  draftAssistantMessageSchema,
  summarizeConversationRequestSchema,
  type AssistantAdviceInput,
  type AssistantConversationSummary,
  type AssistantMeetingPrep,
  type AssistantNextAction,
  type DraftAssistantMessageInput,
  type SummarizeConversationRequest,
} from '@radar/contracts';
import { ValidationError } from '@radar/core';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SalesAssistantService } from './sales-assistant.service';

/** AI Sales Assistant endpoints (P6-02). All gated by `ai.use`; the writer enforces org scoping. */
@ApiTags('assistant')
@Controller('assistant')
export class SalesAssistantController {
  constructor(private readonly assistant: SalesAssistantService) {}

  private orgOf(user: RequestPrincipal): string {
    if (!user.organizationId) {
      throw new ValidationError('Missing x-organization-id header');
    }
    return user.organizationId;
  }

  /** Draft a sales or follow-up message → persisted as a `draft` outreach_message. */
  @Post('draft-message')
  @RequirePermission('ai.use')
  draftMessage(
    @CurrentUser() user: RequestPrincipal,
    @Body(new ZodValidationPipe(draftAssistantMessageSchema)) body: DraftAssistantMessageInput,
  ) {
    return this.assistant.draftMessage(this.orgOf(user), user.userId, body);
  }

  /** Summarize a conversation thread → updates `conversations.summary`. */
  @Post('summarize')
  @RequirePermission('ai.use')
  async summarize(
    @CurrentUser() user: RequestPrincipal,
    @Body(new ZodValidationPipe(summarizeConversationRequestSchema)) body: SummarizeConversationRequest,
  ): Promise<AssistantConversationSummary> {
    const summary = await this.assistant.summarizeConversation(this.orgOf(user), user.userId, body.conversationId);
    return { conversationId: body.conversationId, summary };
  }

  /** Meeting-prep talking points / questions / risks for a lead or opportunity (advisory). */
  @Post('meeting-prep')
  @RequirePermission('ai.use')
  meetingPrep(
    @CurrentUser() user: RequestPrincipal,
    @Body(new ZodValidationPipe(assistantAdviceSchema)) body: AssistantAdviceInput,
  ): Promise<AssistantMeetingPrep> {
    return this.assistant.prepareMeeting(this.orgOf(user), user.userId, body.entityType, body.entityId);
  }

  /** Single best next action for a lead or opportunity (advisory). */
  @Post('next-action')
  @RequirePermission('ai.use')
  nextAction(
    @CurrentUser() user: RequestPrincipal,
    @Body(new ZodValidationPipe(assistantAdviceSchema)) body: AssistantAdviceInput,
  ): Promise<AssistantNextAction> {
    return this.assistant.suggestNextAction(this.orgOf(user), user.userId, body.entityType, body.entityId);
  }
}
