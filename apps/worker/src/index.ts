import { logger } from "./lib/logger.js";
import { processHotLeadNotifications } from "./services/lead-notification.service.js";

async function main() {
  const startedAt = Date.now();

  logger.info("LeadRadar worker started.");

  try {
    const result = await processHotLeadNotifications();

    const durationMs = Date.now() - startedAt;

    logger.success("LeadRadar worker finished.", {
      ...result,
      durationMs
    });

    process.exit(0);
  } catch (error) {
    logger.error("LeadRadar worker failed.", error);
    process.exit(1);
  }
}

main();