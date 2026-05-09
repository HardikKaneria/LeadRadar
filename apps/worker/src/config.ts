import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from apps/worker/.env
dotenv.config({
  path: path.resolve(__dirname, "../.env")
});

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  BREVO_API_KEY: z.string().min(20),
  BREVO_SENDER_EMAIL: z.string().email(),
  BREVO_SENDER_NAME: z.string().default("LeadRadar"),

  ALERT_RECIPIENTS: z.string().min(3),
  MIN_SCORE: z.coerce.number().int().min(0).max(100).default(70),

  DASHBOARD_URL: z.string().url().default("http://localhost:5173"),

  DRY_RUN: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid worker environment variables");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

export const config = {
  supabaseUrl: data.SUPABASE_URL,
  supabaseServiceRoleKey: data.SUPABASE_SERVICE_ROLE_KEY,

  brevoApiKey: data.BREVO_API_KEY,
  brevoSenderEmail: data.BREVO_SENDER_EMAIL,
  brevoSenderName: data.BREVO_SENDER_NAME,

  alertRecipients: data.ALERT_RECIPIENTS.split(",")
    .map((email) => email.trim())
    .filter(Boolean),

  minScore: data.MIN_SCORE,
  dashboardUrl: data.DASHBOARD_URL.replace(/\/$/, ""),
  dryRun: data.DRY_RUN
};