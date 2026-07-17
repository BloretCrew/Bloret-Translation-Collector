/**
 * App configuration — loaded from project-root config.json.
 * Re-exports flat env helpers for auth / passport modules.
 */
export {
  getEnv,
  isPassportConfigured,
  loadConfig,
  applyConfigToProcessEnv,
  type Env,
  type AppConfig,
} from "./config";
