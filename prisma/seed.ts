import { prisma } from "../src/lib/db";
import { bootstrapWorkspaceId } from "../src/lib/bootstrap";
import { hashPassword } from "../src/lib/password";

async function main() {
  const platformAdminUsername =
    process.env.PLATFORM_ADMIN_USERNAME ?? process.env.BOOTSTRAP_USERNAME;
  const platformAdminPassword =
    process.env.PLATFORM_ADMIN_PASSWORD ?? process.env.BOOTSTRAP_PASSWORD;
  const platformAdminDisplayName =
    process.env.PLATFORM_ADMIN_DISPLAY_NAME ?? platformAdminUsername;

  if (!platformAdminUsername || !platformAdminPassword) {
    throw new Error(
      "PLATFORM_ADMIN_USERNAME and PLATFORM_ADMIN_PASSWORD are required",
    );
  }

  const platformAdminPasswordHash = await hashPassword(platformAdminPassword);

  await prisma.platformAdmin.upsert({
    where: { username: platformAdminUsername },
    update: {
      displayName: platformAdminDisplayName ?? platformAdminUsername,
      passwordHash: platformAdminPasswordHash,
    },
    create: {
      username: platformAdminUsername,
      displayName: platformAdminDisplayName ?? platformAdminUsername,
      passwordHash: platformAdminPasswordHash,
    },
  });

  const customerUsername = process.env.BOOTSTRAP_CUSTOMER_USERNAME;
  const customerPassword = process.env.BOOTSTRAP_CUSTOMER_PASSWORD;

  if (customerUsername && customerPassword) {
    const workspaceName = process.env.BOOTSTRAP_WORKSPACE_NAME ?? "CNC Factory";
    const workspace = await prisma.workspace.upsert({
      where: { id: bootstrapWorkspaceId },
      update: { name: workspaceName },
      create: { id: bootstrapWorkspaceId, name: workspaceName },
    });
    const customerPasswordHash = await hashPassword(customerPassword);
    const customerDisplayName =
      process.env.BOOTSTRAP_CUSTOMER_DISPLAY_NAME ?? customerUsername;

    await prisma.user.upsert({
      where: { username: customerUsername },
      update: {
        workspaceId: workspace.id,
        displayName: customerDisplayName,
        role: "manager",
        passwordHash: customerPasswordHash,
        passwordPlaintext: customerPassword,
      },
      create: {
        id: "bootstrap-user",
        workspaceId: workspace.id,
        username: customerUsername,
        displayName: customerDisplayName,
        role: "manager",
        passwordHash: customerPasswordHash,
        passwordPlaintext: customerPassword,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
