#!/usr/bin/env node
/**
 * Real HTTP happy-path against a running server (or boots one).
 * Usage: node scripts/http-flow.mjs [baseUrl]
 */
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { sealData } from "iron-session";
import { configToEnv, loadConfigFile, root } from "./lib-config.mjs";

const baseArg = process.argv[2];
const { config } = loadConfigFile();
const port = Number(config?.port) || 3000;
const base = baseArg || `http://127.0.0.1:${port}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealth(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) {
        const j = await res.json();
        if (j.status === "ok") return j;
      }
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error("health check failed");
}

async function main() {
  let child = null;
  const startedByUs = !baseArg;

  if (startedByUs) {
    const dist = join(root, "dist", "server.mjs");
    if (!existsSync(dist)) {
      const build = spawn(process.execPath, [join(root, "scripts", "build.mjs")], {
        cwd: root,
        stdio: "inherit",
      });
      await new Promise((res, rej) => {
        build.on("exit", (c) => (c === 0 ? res() : rej(new Error("build failed"))));
      });
    }
    const env = configToEnv(config, { NODE_ENV: "production", PORT: String(port) });
    child = spawn(process.execPath, [dist], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => process.stderr.write(d));
    child.stderr.on("data", (d) => process.stderr.write(d));
  }

  try {
    const health = await waitHealth(base);
    console.log("HEALTH", JSON.stringify(health));

    // unauthenticated API
    const unauth = await fetch(`${base}/api/v1/orgs`);
    console.log("UNAUTH_ORGS", unauth.status);
    if (unauth.status !== 401) throw new Error(`expected 401, got ${unauth.status}`);

    // unauthenticated HTML
    const appRes = await fetch(`${base}/app`, { redirect: "manual" });
    console.log("UNAUTH_APP", appRes.status, appRes.headers.get("location"));
    if (appRes.status !== 302 && appRes.status !== 301) {
      throw new Error(`expected redirect from /app, got ${appRes.status}`);
    }

    // forge session cookie (same secret as server)
    const password = config.sessionSecret || "dev-only-session-secret-change-me-32chars";
    // Ensure user exists via temporary sealed session after DB insert through API won't work without session.
    // Use sealData with a user we create via postgres in this script.
    const { default: postgres } = await import("postgres");
    const { resolveDatabaseUrl } = await import("./lib-config.mjs");
    const sql = postgres(resolveDatabaseUrl(config), { max: 1 });
    const username = `httpflow-${Date.now().toString(36)}`;
    const [user] = await sql`
      insert into users (username, last_login_at)
      values (${username}, now())
      returning id, username
    `;
    const sealed = await sealData(
      {
        isLoggedIn: true,
        userId: user.id,
        username: user.username,
      },
      { password, ttl: 60 * 60 },
    );
    const cookie = `bloret_translation_session=${sealed}`;

    const stamp = Date.now().toString(36);
    const orgBody = {
      name: `HTTP Org ${stamp}`,
      slug: `http-org-${stamp}`,
      description: "http-flow",
    };
    const createRes = await fetch(`${base}/api/v1/orgs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(orgBody),
    });
    const createData = await createRes.json();
    console.log("CREATE_ORG", createRes.status, JSON.stringify(createData));
    if (createRes.status !== 201) throw new Error("create org failed");

    const listRes = await fetch(`${base}/api/v1/orgs`, {
      headers: { Cookie: cookie },
    });
    const listData = await listRes.json();
    console.log("LIST_ORGS", listRes.status, (listData.orgs || []).map((o) => o.slug).join(","));
    if (!listData.orgs?.some((o) => o.slug === orgBody.slug)) {
      throw new Error("created org not in list");
    }

    const pageRes = await fetch(`${base}/app`, { headers: { Cookie: cookie } });
    const html = await pageRes.text();
    console.log("APP_PAGE", pageRes.status, html.includes(orgBody.slug) ? "slug_in_html" : "slug_missing");
    if (!html.includes(orgBody.slug) && !html.includes(orgBody.name)) {
      throw new Error("org not visible on /app HTML");
    }

    // project under org
    const projSlug = `proj-${stamp}`;
    const projRes = await fetch(`${base}/api/v1/orgs/${orgBody.slug}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        name: "HTTP Project",
        slug: projSlug,
        sourceLocale: "zh-CN",
        targetLocales: ["en"],
        visibility: "org",
      }),
    });
    const projData = await projRes.json();
    console.log("CREATE_PROJECT", projRes.status, JSON.stringify(projData));
    if (projRes.status !== 201) throw new Error("create project failed");

    // cleanup
    await sql`delete from organizations where slug = ${orgBody.slug}`;
    await sql`delete from users where id = ${user.id}`;
    await sql.end();

    console.log("FLOW_OK");
  } finally {
    if (child) {
      child.kill("SIGTERM");
      await sleep(300);
      try {
        child.kill("SIGKILL");
      } catch {
        /* */
      }
    }
  }
}

main().catch((e) => {
  console.error("FLOW_FAIL", e);
  process.exit(1);
});
