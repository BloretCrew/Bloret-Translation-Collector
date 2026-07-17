/**
 * Console log helper — follows BloretCrew/CONSOLE-LOG-SPEC
 * https://github.com/BloretCrew/CONSOLE-LOG-SPEC
 *
 * Dual channel: colored console + plain-text file under ./log/
 */
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Request, Response } from "express";

const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GRAY = "\x1b[90m";
const WHITE = "\x1b[37m";
const MAGENTA = "\x1b[35m";

const LOG_DIR = join(process.cwd(), "log");

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function makeLogFileName(): string {
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    pad2(d.getMonth() + 1),
    pad2(d.getDate()),
  ].join("-") +
    "-" +
    [pad2(d.getHours()), pad2(d.getMinutes()), pad2(d.getSeconds())].join("-");
  // BTC = Bloret Translation Collector (project prefix, same pattern as BBBS-*)
  return `BTC-${stamp}.log`;
}

let logFilePath: string | null = null;

function ensureLogFile(): string {
  if (logFilePath) return logFilePath;
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
  logFilePath = join(LOG_DIR, makeLogFileName());
  return logFilePath;
}

function formatArgs(args: unknown[]): string {
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

function writeFile(level: string, message: string) {
  try {
    const line = `[${new Date().toLocaleString()}] [${level}] ${message}\n`;
    appendFileSync(ensureLogFile(), line, { flag: "a" });
  } catch {
    // never throw from logger
  }
}

function writeConsole(color: string, level: string, message: string) {
  // eslint-disable-next-line no-console
  console.log(`${color}[${level}]${RESET} ${message}`);
}

function log(level: string, color: string, args: unknown[]) {
  const message = formatArgs(args);
  writeConsole(color, level, message);
  writeFile(level, message);
}

function methodColor(method: string): string {
  const m = method.toUpperCase();
  if (m === "GET") return GREEN;
  if (m === "POST") return YELLOW;
  return WHITE;
}

function statusColor(status: number): string {
  if (status >= 500) return RED;
  if (status >= 400) return YELLOW;
  return GREEN; // 2xx, 3xx
}

function clientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0]!.trim();
  if (Array.isArray(xf) && xf[0]) return xf[0].split(",")[0]!.trim();
  return req.socket?.remoteAddress || req.ip || "-";
}

function requestUser(req: Request): { name: string; loggedIn: boolean } {
  const session = req.session;
  if (session?.isLoggedIn && session.username) {
    return { name: session.username, loggedIn: true };
  }
  return { name: "Guest", loggedIn: false };
}

export const Logger = {
  info(...args: unknown[]) {
    log("INFO", CYAN, args);
  },
  success(...args: unknown[]) {
    log("SUCCESS", GREEN, args);
  },
  warn(...args: unknown[]) {
    log("WARN", YELLOW, args);
  },
  error(...args: unknown[]) {
    log("ERROR", RED, args);
  },
  debug(...args: unknown[]) {
    log("DEBUG", GRAY, args);
  },
  /**
   * HTTP request line:
   * METHOD URL STATUS [USER] DURATIONms [IP]
   */
  request(req: Request, res: Response, durationMs: number) {
    const method = (req.method || "GET").toUpperCase();
    const url = req.originalUrl || req.url || "/";
    const status = res.statusCode || 0;
    const { name, loggedIn } = requestUser(req);
    const ip = clientIp(req);
    const duration = Math.max(0, Math.round(durationMs));

    const plain = `${method} ${url} ${status} [${name}] ${duration}ms [${ip}]`;

    const colored =
      `${methodColor(method)}${method}${RESET} ` +
      `${url} ` +
      `${statusColor(status)}${status}${RESET} ` +
      `${loggedIn ? MAGENTA : GRAY}[${name}]${RESET} ` +
      `${CYAN}${duration}ms${RESET} ` +
      `${GRAY}[${ip}]${RESET}`;

    // eslint-disable-next-line no-console
    console.log(colored);
    writeFile("REQUEST", plain);
  },
};

export default Logger;
