import type { UserRole } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/db";

export type CreateWorkspaceWithInitialAccountInput = {
  workspaceName: string;
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
};

export type CreateCustomerUserInput = {
  workspaceId: string;
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
};

export type CreatePlatformAdminInput = {
  username: string;
  displayName: string;
  password: string;
};

export type UpdateCustomerUserInput = {
  userId: string;
  workspaceId: string;
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
};

const userRoles = new Set<UserRole>(["manager", "employee"]);

function cleanRequired(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label}必填`);
  return trimmed;
}

function validateRole(role: UserRole) {
  if (!userRoles.has(role)) throw new Error("账号角色无效");
}

function assertUniqueError(error: unknown, message: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new Error(message);
  }
  throw error;
}

export async function listAdminDashboard() {
  const [workspaceCount, customerUserCount, platformAdminCount, workspaces] =
    await Promise.all([
      prisma.workspace.count(),
      prisma.user.count(),
      prisma.platformAdmin.count(),
      prisma.workspace.findMany({
        include: {
          users: {
            select: {
              id: true,
              workspaceId: true,
              username: true,
              displayName: true,
              role: true,
              passwordPlaintext: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

  return { workspaceCount, customerUserCount, platformAdminCount, workspaces };
}

export async function listAdminWorkspaces() {
  return prisma.workspace.findMany({
    include: {
      users: {
        select: {
          id: true,
          workspaceId: true,
          username: true,
          displayName: true,
          role: true,
          passwordPlaintext: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listCustomerAccounts() {
  return prisma.user.findMany({
    select: {
      id: true,
      workspaceId: true,
      username: true,
      displayName: true,
      role: true,
      passwordPlaintext: true,
      createdAt: true,
      updatedAt: true,
      workspace: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listPlatformAdmins() {
  return prisma.platformAdmin.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function createWorkspaceWithInitialAccount(
  input: CreateWorkspaceWithInitialAccountInput,
) {
  validateRole(input.role);
  const workspaceName = cleanRequired(input.workspaceName, "工厂名称");
  const username = cleanRequired(input.username, "账号");
  const displayName = cleanRequired(input.displayName, "姓名");
  const password = cleanRequired(input.password, "密码");
  const passwordHash = await hashPassword(password);

  try {
    return await prisma.workspace.create({
      data: {
        name: workspaceName,
        users: {
          create: {
            username,
            displayName,
            role: input.role,
            passwordHash,
            passwordPlaintext: password,
          },
        },
      },
      include: { users: true },
    });
  } catch (error) {
    assertUniqueError(error, "账号已存在");
  }
}

export async function createCustomerUser(input: CreateCustomerUserInput) {
  validateRole(input.role);
  const workspaceId = cleanRequired(input.workspaceId, "工厂");
  const username = cleanRequired(input.username, "账号");
  const displayName = cleanRequired(input.displayName, "姓名");
  const password = cleanRequired(input.password, "密码");
  const passwordHash = await hashPassword(password);

  try {
    return await prisma.user.create({
      data: {
        workspaceId,
        username,
        displayName,
        role: input.role,
        passwordHash,
        passwordPlaintext: password,
      },
    });
  } catch (error) {
    assertUniqueError(error, "账号已存在");
  }
}

export async function updateCustomerUser(input: UpdateCustomerUserInput) {
  validateRole(input.role);
  const userId = cleanRequired(input.userId, "账号");
  const workspaceId = cleanRequired(input.workspaceId, "工厂");
  const username = cleanRequired(input.username, "账号");
  const displayName = cleanRequired(input.displayName, "姓名");
  const password = input.password.trim();
  const passwordData = password
    ? {
        passwordHash: await hashPassword(password),
        passwordPlaintext: password,
      }
    : {};

  try {
    return await prisma.user.update({
      where: { id: userId },
      data: {
        workspaceId,
        username,
        displayName,
        role: input.role,
        ...passwordData,
      },
    });
  } catch (error) {
    assertUniqueError(error, "账号已存在");
  }
}

export async function createPlatformAdmin(input: CreatePlatformAdminInput) {
  const username = cleanRequired(input.username, "账号");
  const displayName = cleanRequired(input.displayName, "姓名");
  const password = cleanRequired(input.password, "密码");
  const passwordHash = await hashPassword(password);

  try {
    return await prisma.platformAdmin.create({
      data: {
        username,
        displayName,
        passwordHash,
      },
    });
  } catch (error) {
    assertUniqueError(error, "平台管理员账号已存在");
  }
}
