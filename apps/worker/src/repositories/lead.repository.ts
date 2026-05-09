import { supabase } from "../lib/supabase.js";
import type { Lead } from "../types.js";

export async function getHotUnnotifiedLeads(minScore: number): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .gte("score", minScore)
    .is("notified_at", null)
    .in("status", ["new", "interested"])
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Failed to fetch hot leads: ${error.message}`);
  }

  return (data ?? []) as Lead[];
}

export async function markLeadNotified(params: {
  leadId: string;
  providerMessageId?: string;
  recipients: string[];
}) {
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      notified_at: now,
      notification_error: null,
      updated_at: now
    })
    .eq("id", params.leadId);

  if (updateError) {
    throw new Error(`Failed to mark lead notified: ${updateError.message}`);
  }

  const { error: logError } = await supabase.from("notification_logs").insert({
    lead_id: params.leadId,
    channel: "email",
    provider: "brevo",
    recipients: params.recipients,
    status: "sent",
    provider_message_id: params.providerMessageId ?? null,
    sent_at: now
  });

  if (logError) {
    throw new Error(`Failed to insert notification log: ${logError.message}`);
  }
}

export async function markLeadNotificationFailed(params: {
  leadId: string;
  recipients: string[];
  errorMessage: string;
}) {
  const now = new Date().toISOString();

  await supabase
    .from("leads")
    .update({
      notification_error: params.errorMessage,
      updated_at: now
    })
    .eq("id", params.leadId);

  await supabase.from("notification_logs").insert({
    lead_id: params.leadId,
    channel: "email",
    provider: "brevo",
    recipients: params.recipients,
    status: "failed",
    error_message: params.errorMessage,
    sent_at: now
  });
}