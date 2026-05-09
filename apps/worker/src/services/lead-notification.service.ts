import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import {
  getHotUnnotifiedLeads,
  markLeadNotificationFailed,
  markLeadNotified
} from "../repositories/lead.repository.js";
import { sendBrevoEmail } from "./brevo-mailer.service.js";
import { buildHotLeadEmail } from "../templates/hot-lead-email.template.js";

export async function processHotLeadNotifications() {
  logger.info(`Checking hot leads with score >= ${config.minScore}`);

  const leads = await getHotUnnotifiedLeads(config.minScore);

  if (leads.length === 0) {
    logger.success("No new hot leads to notify.");
    return {
      checked: 0,
      sent: 0,
      failed: 0
    };
  }

  logger.info(`Found ${leads.length} hot lead(s).`);

  let sent = 0;
  let failed = 0;

  const recipients = config.alertRecipients.map((email) => ({
    email
  }));

  for (const lead of leads) {
    try {
      logger.info(`Sending alert for lead: ${lead.title}`);

      const email = buildHotLeadEmail({
        lead,
        dashboardUrl: config.dashboardUrl
      });

      const result = await sendBrevoEmail({
        to: recipients,
        subject: email.subject,
        htmlContent: email.htmlContent,
        textContent: email.textContent,
        tags: ["leadradar", "hkrafted", "hot-lead"]
      });

      await markLeadNotified({
        leadId: lead.id,
        providerMessageId:
          result.messageId ?? result.messageIds?.join(",") ?? undefined,
        recipients: config.alertRecipients
      });

      sent += 1;
      logger.success(`Alert sent for lead: ${lead.title}`);
    } catch (error) {
      failed += 1;

      const errorMessage =
        error instanceof Error ? error.message : "Unknown email error";

      logger.error(`Failed to send alert for lead: ${lead.title}`, errorMessage);

      await markLeadNotificationFailed({
        leadId: lead.id,
        recipients: config.alertRecipients,
        errorMessage
      });
    }
  }

  return {
    checked: leads.length,
    sent,
    failed
  };
}