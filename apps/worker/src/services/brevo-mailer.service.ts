import { config } from "../config.js";
import type { BrevoSendEmailInput, BrevoSendEmailResult } from "../types.js";

const BREVO_SEND_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";

export async function sendBrevoEmail(
  input: BrevoSendEmailInput
): Promise<BrevoSendEmailResult> {
  if (config.dryRun) {
    console.log("DRY_RUN=true. Email not sent.");
    console.log({
      to: input.to,
      subject: input.subject,
      tags: input.tags
    });

    return {
      messageId: "dry-run-message-id"
    };
  }

  const response = await fetch(BREVO_SEND_EMAIL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.brevoApiKey
    },
    body: JSON.stringify({
      sender: {
        email: config.brevoSenderEmail,
        name: config.brevoSenderName
      },
      to: input.to,
      subject: input.subject,
      htmlContent: input.htmlContent,
      textContent: input.textContent,
      tags: input.tags ?? ["leadradar", "hot-lead"]
    })
  });

  const responseText = await response.text();

  let payload: unknown = null;

  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = responseText;
  }

  if (!response.ok) {
    throw new Error(
      `Brevo email failed with ${response.status}: ${JSON.stringify(payload)}`
    );
  }

  return payload as BrevoSendEmailResult;
}