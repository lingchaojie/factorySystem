import { prisma } from "../src/lib/db";
import { bootstrapWorkspaceId } from "../src/lib/bootstrap";
import { hashPassword } from "../src/lib/password";

async function main() {
  const workspaceName = process.env.BOOTSTRAP_WORKSPACE_NAME ?? "CNC Factory";
  const username = process.env.BOOTSTRAP_USERNAME;
  const password = process.env.BOOTSTRAP_PASSWORD;

  if (!username || !password) {
    throw new Error("BOOTSTRAP_USERNAME and BOOTSTRAP_PASSWORD are required");
  }

  const workspace = await prisma.workspace.upsert({
    where: { id: bootstrapWorkspaceId },
    update: { name: workspaceName },
    create: { id: bootstrapWorkspaceId, name: workspaceName },
  });

  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { id: "bootstrap-user" },
    update: { username, passwordHash },
    create: {
      id: "bootstrap-user",
      workspaceId: workspace.id,
      username,
      passwordHash,
    },
  });
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
