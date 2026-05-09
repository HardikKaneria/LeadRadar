import dayjs from "dayjs";
import type { Lead } from "../types.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value?: string | null) {
  if (!value) return "Not available";
  return dayjs(value).format("DD MMM YYYY, hh:mm A");
}

function getScoreLabel(score: number) {
  if (score >= 80) return "Hot Lead";
  if (score >= 60) return "Good Fit";
  if (score >= 40) return "Review";
  return "Low Priority";
}

export function buildHotLeadEmail(params: {
  lead: Lead;
  dashboardUrl: string;
}) {
  const { lead, dashboardUrl } = params;

  const leadUrl = `${dashboardUrl}/leads/${lead.id}`;
  const matchedKeywords = lead.matched_keywords ?? [];

  const safeTitle = escapeHtml(lead.title);
  const safePlatform = escapeHtml(lead.platform);
  const safeBudget = escapeHtml(lead.budget_text || "Not specified");
  const safeReason = escapeHtml(
    lead.score_reason || "Matched based on Hkrafted service keywords."
  );
  const safeDescription = escapeHtml(
    lead.description?.slice(0, 700) || "No description available."
  );

  const keywordHtml =
    matchedKeywords.length > 0
      ? matchedKeywords
          .map(
            (keyword) =>
              `<span style="display:inline-block;margin:4px 6px 4px 0;padding:6px 10px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:12px;font-weight:600;">${escapeHtml(
                keyword
              )}</span>`
          )
          .join("")
      : `<span style="color:#64748b;">No keywords captured</span>`;

  const subject = `LeadRadar: ${getScoreLabel(lead.score)} | ${lead.score}/100 | ${lead.title}`;

  const textContent = `
LeadRadar Hot Lead

Title: ${lead.title}
Platform: ${lead.platform}
Score: ${lead.score}/100
Budget: ${lead.budget_text || "Not specified"}
Posted: ${formatDate(lead.posted_at)}
Matched Keywords: ${matchedKeywords.join(", ") || "Not available"}

Dashboard:
${leadUrl}

Original Job:
${lead.url}
`;

  const htmlContent = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:#0f172a;color:#ffffff;">
                <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#cbd5e1;font-weight:700;">LeadRadar by Hkrafted</div>
                <h1 style="margin:10px 0 0;font-size:24px;line-height:1.3;">New ${getScoreLabel(
                  lead.score
                )}</h1>
              </td>
            </tr>

            <tr>
              <td style="padding:28px;">
                <div style="margin-bottom:18px;">
                  <div style="font-size:13px;color:#64748b;font-weight:700;text-transform:uppercase;">${safePlatform}</div>
                  <h2 style="margin:8px 0 10px;font-size:22px;line-height:1.35;color:#0f172a;">${safeTitle}</h2>
                  <p style="margin:0;color:#475569;font-size:15px;line-height:1.6;">${safeDescription}</p>
                </div>

                <table width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;border-collapse:collapse;">
                  <tr>
                    <td style="width:33.33%;padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
                      <div style="font-size:12px;color:#64748b;font-weight:700;">Score</div>
                      <div style="font-size:24px;font-weight:800;color:#0f172a;margin-top:4px;">${lead.score}/100</div>
                    </td>
                    <td style="width:33.33%;padding:14px;border:1px solid #e2e8f0;background:#f8fafc;">
                      <div style="font-size:12px;color:#64748b;font-weight:700;">Budget</div>
                      <div style="font-size:18px;font-weight:800;color:#0f172a;margin-top:4px;">${safeBudget}</div>
                    </td>
                    <td style="width:33.33%;padding:14px;border:1px solid #e2e8f0;background:#f8fafc;">
                      <div style="font-size:12px;color:#64748b;font-weight:700;">Posted</div>
                      <div style="font-size:15px;font-weight:700;color:#0f172a;margin-top:4px;">${escapeHtml(
                        formatDate(lead.posted_at)
                      )}</div>
                    </td>
                  </tr>
                </table>

                <div style="margin:22px 0;">
                  <div style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:8px;">Matched Skills</div>
                  <div>${keywordHtml}</div>
                </div>

                <div style="margin:22px 0;padding:16px;border-radius:14px;background:#fefce8;border:1px solid #fde68a;">
                  <div style="font-size:14px;font-weight:800;color:#854d0e;margin-bottom:6px;">Why this lead matched</div>
                  <div style="font-size:14px;line-height:1.6;color:#713f12;">${safeReason}</div>
                </div>

                <table cellpadding="0" cellspacing="0" style="margin-top:26px;">
                  <tr>
                    <td>
                      <a href="${leadUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:800;margin-right:10px;">Open in Dashboard</a>
                    </td>
                    <td>
                      <a href="${lead.url}" style="display:inline-block;background:#ffffff;color:#0f172a;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:800;border:1px solid #cbd5e1;">Open Original Job</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 28px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.6;">
                This alert was sent by LeadRadar, Hkrafted’s internal freelance lead tracking dashboard.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

  return {
    subject,
    htmlContent,
    textContent
  };
}