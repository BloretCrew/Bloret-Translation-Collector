/**
 * Load config.json into process.env when the Node server boots.
 * Middleware (Edge) still relies on env injected by scripts/run-*.mjs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { applyConfigToProcessEnv } = await import("./lib/config");
    applyConfigToProcessEnv();
  }
}
