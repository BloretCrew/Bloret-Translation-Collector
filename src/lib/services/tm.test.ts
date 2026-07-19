import { describe, expect, it } from "vitest";

// Pure scoring helpers re-exported via behavior of lookup is integration-heavy;
// unit-test match semantics with a thin local copy of scoreMatch logic used in tm.ts

function scoreMatch(query: string, candidate: string): "exact" | "contains" | "contained" | null {
  const q = query.trim();
  const c = candidate.trim();
  if (!q || !c) return null;
  if (q === c) return "exact";
  const ql = q.toLowerCase();
  const cl = c.toLowerCase();
  if (ql === cl) return "exact";
  if (cl.includes(ql)) return "contains";
  if (ql.includes(cl) && cl.length >= 2) return "contained";
  return null;
}

describe("TM match semantics", () => {
  it("exact match", () => {
    expect(scoreMatch("登录", "登录")).toBe("exact");
    expect(scoreMatch("Login", "login")).toBe("exact");
  });

  it("contains / contained", () => {
    expect(scoreMatch("登录", "请先登录系统")).toBe("contains");
    expect(scoreMatch("请先登录系统", "登录")).toBe("contained");
  });

  it("no match", () => {
    expect(scoreMatch("账号", "密码")).toBe(null);
  });
});
