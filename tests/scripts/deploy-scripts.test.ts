import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("production deploy scripts", () => {
  it("deploys main by default from both deployment entrypoints", async () => {
    const [tencentDeploy, serverDeploy] = await Promise.all([
      readFile("scripts/deploy-tencent.sh", "utf8"),
      readFile("scripts/deploy-production.sh", "utf8"),
    ]);

    expect(tencentDeploy).toContain('DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"');
    expect(tencentDeploy).toContain("DEPLOY_BRANCH=main");
    expect(tencentDeploy).not.toContain("factory-mvp");

    expect(serverDeploy).toContain('DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"');
    expect(serverDeploy).toContain("Default: main.");
    expect(serverDeploy).toContain("DEPLOY_BRANCH=main");
    expect(serverDeploy).not.toContain("factory-mvp");
  });
});
