export const logger = {
    info(message: string, meta?: unknown) {
      console.log(`ℹ️  ${message}`, meta ?? "");
    },
  
    success(message: string, meta?: unknown) {
      console.log(`✅ ${message}`, meta ?? "");
    },
  
    warn(message: string, meta?: unknown) {
      console.warn(`⚠️  ${message}`, meta ?? "");
    },
  
    error(message: string, error?: unknown) {
      console.error(`❌ ${message}`, error ?? "");
    }
  };