/**
 * Console log helper for Node starters — BloretCrew/CONSOLE-LOG-SPEC
 * (mirrors src/lib/logger.ts; no Express types)
 */
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GRAY = "\x1b[90m";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = join(root, "log");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function makeLogFileName() {
  const d = new Date();
  const stamp =
    [d.getFullYear(), pad2(d.getMonth() + 1), pad2(d.getDate())].join("-") +
    "-" +
    [pad2(d.getHours()), pad2(d.getMinutes()), pad2(d.getSeconds())].join("-");
  return `BTC-${stamp}.log`;
}

let logFilePath = null;

function ensureLogFile() {
  if (logFilePath) return logFilePath;
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  logFilePath = join(LOG_DIR, makeLogFileName());
  return logFilePath;
}

function formatArgs(args) {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

function writeFile(level, message) {
  try {
    const line = `[${new Date().toLocaleString()}] [${level}] ${message}\n`;
    appendFileSync(ensureLogFile(), line, { flag: "a" });
  } catch {
    /* ignore */
  }
}

function writeConsole(color, level, message) {
  console.log(`${color}[${level}]${RESET} ${message}`);
}

function log(level, color, args) {
  const message = formatArgs(args);
  writeConsole(color, level, message);
  writeFile(level, message);
}

export const Logger = {
  info(...args) {
    log("INFO", CYAN, args);
  },
  success(...args) {
    log("SUCCESS", GREEN, args);
  },
  warn(...args) {
    log("WARN", YELLOW, args);
  },
  error(...args) {
    log("ERROR", RED, args);
  },
  debug(...args) {
    log("DEBUG", GRAY, args);
  },
};
