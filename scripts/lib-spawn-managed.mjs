/**
 * Spawn a child and ensure Ctrl+C / SIGTERM tears down the whole tree.
 *
 * Fixes:
 * - child.killed is true after kill() is *sent*, not after exit — force-kill
 *   must track actual exit, not child.killed
 * - tsx watch / node can leave grandchildren holding the port — kill the
 *   process group when possible
 */
import { spawn } from "child_process";

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import('child_process').SpawnOptions} options
 * @returns {import('child_process').ChildProcess}
 */
export function spawnManaged(command, args, options = {}) {
  const useGroup = process.platform !== "win32";
  // MCSM / process supervisors track the direct child PID. Detaching into a new
  // session makes them think the instance exited immediately ("实例已停止") and
  // burn through autoRestartMaxTimes. Keep the child in the same group by default;
  // pass detached:true only for rare cases that need a new session.
  const detached =
    options.detached === true
      ? true
      : options.detached === false
        ? false
        : false;

  const child = spawn(command, args, {
    ...options,
    detached,
    stdio: options.stdio ?? "inherit",
  });

  let exited = false;
  let shuttingDown = false;

  child.on("exit", () => {
    exited = true;
  });

  function killTree(signal) {
    if (!child.pid) return;
    // Only signal the process group when we actually detached as group leader
    if (useGroup && detached) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        /* fall through */
      }
    }
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }

  function shutdown(signal = "SIGTERM") {
    if (shuttingDown) return;
    shuttingDown = true;

    if (exited || !child.pid) {
      process.exit(0);
      return;
    }

    killTree(signal);

    // If still alive after grace period, hard-kill the tree
    const graceMs = 2_000;
    const forceTimer = setTimeout(() => {
      if (exited) return;
      killTree("SIGKILL");
      // Last resort: exit parent even if child ignores kill
      setTimeout(() => process.exit(1), 500).unref();
    }, graceMs);
    forceTimer.unref();
  }

  process.on("SIGINT", () => shutdown("SIGTERM"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // If parent is about to die for other reasons, try cleanup
  process.on("exit", () => {
    if (!exited && child.pid) {
      try {
        if (useGroup && detached) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* */
      }
    }
  });

  child.on("exit", (code, signal) => {
    // Prefer clean exit code; Ctrl+C path often has null code + signal
    if (signal === "SIGTERM" || signal === "SIGINT" || signal === "SIGKILL") {
      process.exit(0);
    }
    process.exit(code ?? 1);
  });

  child.on("error", (err) => {
    console.error(err);
    process.exit(1);
  });

  return child;
}
