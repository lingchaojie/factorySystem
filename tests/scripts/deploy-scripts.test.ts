import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production deploy scripts", () => {
  it("keeps a single current-checkout production deploy entrypoint", async () => {
    await expect(access("scripts/deploy-tencent.sh", constants.F_OK)).rejects.toThrow();

    const [
      serverDeploy,
      productionCompose,
      productionEnvExample,
      dockerfile,
    ] = await Promise.all([
      readFile("scripts/deploy-production.sh", "utf8"),
      readFile("deploy/production/docker-compose.yml", "utf8"),
      readFile("deploy/production/.env.production.example", "utf8"),
      readFile("Dockerfile", "utf8"),
    ]);

    expect(serverDeploy).toContain("Rebuilds the production web image from the current checkout");
    expect(serverDeploy).toContain("compose build web");
    expect(serverDeploy).not.toContain("--no-cache");
    expect(serverDeploy).not.toContain("--pull");
    expect(serverDeploy).toContain("compose up -d --force-recreate web caddy");
    expect(serverDeploy).toContain("git -C \"$ROOT_DIR\" rev-parse --short HEAD");
    expect(serverDeploy).toContain("docker compose version");
    expect(serverDeploy).not.toContain("DEPLOY_BRANCH");
    expect(serverDeploy).not.toContain("git -C \"$ROOT_DIR\" fetch");
    expect(serverDeploy).not.toContain("git -C \"$ROOT_DIR\" checkout");
    expect(serverDeploy).not.toContain("git -C \"$ROOT_DIR\" reset");
    expect(serverDeploy).not.toContain("--domain");
    expect(serverDeploy).not.toContain("--public-host");
    expect(serverDeploy).not.toContain("--branch");
    expect(serverDeploy).not.toContain("--skip-pull");
    expect(serverDeploy).not.toContain("--skip-verify");
    expect(serverDeploy).not.toContain("factory-mvp");

    expect(productionCompose).toContain(
      "PLATFORM_ADMIN_USERNAME: ${PLATFORM_ADMIN_USERNAME:?PLATFORM_ADMIN_USERNAME is required}",
    );
    expect(productionCompose).toContain(
      "PLATFORM_ADMIN_PASSWORD: ${PLATFORM_ADMIN_PASSWORD:?PLATFORM_ADMIN_PASSWORD is required}",
    );
    expect(productionCompose).not.toContain("BOOTSTRAP_USERNAME");
    expect(productionCompose).not.toContain("BOOTSTRAP_PASSWORD");

    expect(productionEnvExample).toContain("PLATFORM_ADMIN_USERNAME=admin");
    expect(productionEnvExample).toContain("PLATFORM_ADMIN_PASSWORD=");
    expect(productionEnvExample).not.toContain("BOOTSTRAP_USERNAME=");
    expect(productionEnvExample).not.toContain("BOOTSTRAP_PASSWORD=");

    expect(productionCompose).toContain("NPM_CONFIG_REGISTRY:");
    expect(productionCompose).toContain("ALPINE_MIRROR:");
    expect(productionEnvExample).toContain("NPM_CONFIG_REGISTRY=https://registry.npmmirror.com");
    expect(productionEnvExample).toContain("ALPINE_MIRROR=https://mirrors.tencent.com/alpine");
    expect(dockerfile).toContain("ARG NPM_CONFIG_REGISTRY");
    expect(dockerfile).toContain("npm config set registry");
    expect(dockerfile).toContain("--fetch-retries=5");
    expect(dockerfile).toContain("ARG ALPINE_MIRROR");
    expect(dockerfile).toContain("/etc/apk/repositories");
  });
});
