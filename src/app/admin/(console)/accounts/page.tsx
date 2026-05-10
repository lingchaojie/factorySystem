import React from "react";
import {
  createCustomerUserAction,
  updateCustomerUserAction,
} from "@/app/admin/actions";
import { CreateEntityDialog } from "@/components/create-entity-dialog";
import {
  SelectInput,
  SubmitButton,
  TextInput,
} from "@/components/forms";
import {
  listAdminWorkspaces,
  listCustomerAccounts,
} from "@/server/services/platform-admin";

const roleOptions = [
  { value: "manager", label: "manager" },
  { value: "employee", label: "employee" },
];

export default async function AdminAccountsPage() {
  const [workspaces, accounts] = await Promise.all([
    listAdminWorkspaces(),
    listCustomerAccounts(),
  ]);
  const workspaceOptions = workspaces.map((workspace) => ({
    value: workspace.id,
    label: workspace.name,
  }));

  return (
    <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-950">创建客户账号</h1>
        <p className="mt-1 text-sm text-slate-500">
          一个工厂可以创建多个 manager 或 employee 账号。
        </p>
        {workspaces.length === 0 ? (
          <p className="mt-5 text-sm text-slate-500">
            请先创建工厂，再创建客户账号。
          </p>
        ) : (
          <form action={createCustomerUserAction} className="mt-5 grid gap-4">
            <SelectInput
              label="所属工厂"
              name="workspaceId"
              options={workspaceOptions}
              required
            />
            <TextInput label="客户账号" name="username" required />
            <TextInput label="姓名" name="displayName" required />
            <TextInput
              label="初始密码"
              name="password"
              type="password"
              required
            />
            <SelectInput
              label="角色"
              name="role"
              defaultValue="employee"
              options={roleOptions}
              required
            />
            <SubmitButton>创建账号</SubmitButton>
          </form>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">客户账号</h2>
        </div>
        {accounts.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">暂无客户账号。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">账号</th>
                  <th className="px-4 py-3">姓名</th>
                  <th className="px-4 py-3">角色</th>
                  <th className="px-4 py-3">可见密码</th>
                  <th className="px-4 py-3">工厂</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="px-4 py-4 font-medium text-slate-950">
                      {account.username}
                    </td>
                    <td className="px-4 py-4 text-slate-950">
                      {account.displayName}
                    </td>
                    <td className="px-4 py-4 text-slate-950">
                      {account.role}
                    </td>
                    <td className="px-4 py-4 font-mono text-slate-950">
                      {account.passwordPlaintext || "未保存，可重置"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {account.workspace.name}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <CreateEntityDialog
                        buttonLabel="编辑账号"
                        title="编辑客户账号"
                        buttonIcon="pencil"
                        buttonVariant="secondary"
                      >
                        <form
                          action={updateCustomerUserAction}
                          className="grid gap-4"
                        >
                          <input
                            type="hidden"
                            name="userId"
                            value={account.id}
                          />
                          <SelectInput
                            label="所属工厂"
                            name="workspaceId"
                            defaultValue={account.workspaceId}
                            options={workspaceOptions}
                            required
                          />
                          <TextInput
                            label="客户账号"
                            id={`username-${account.id}`}
                            name="username"
                            defaultValue={account.username}
                            required
                          />
                          <TextInput
                            label="姓名"
                            id={`displayName-${account.id}`}
                            name="displayName"
                            defaultValue={account.displayName}
                            required
                          />
                          <TextInput
                            label="新密码（留空不修改）"
                            id={`password-${account.id}`}
                            name="password"
                            type="text"
                            autoComplete="new-password"
                          />
                          <SelectInput
                            label="角色"
                            id={`role-${account.id}`}
                            name="role"
                            defaultValue={account.role}
                            options={roleOptions}
                            required
                          />
                          <SubmitButton>保存账号</SubmitButton>
                        </form>
                      </CreateEntityDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
