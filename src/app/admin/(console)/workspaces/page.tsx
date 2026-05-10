import { createWorkspaceWithInitialAccountAction } from "@/app/admin/actions";
import {
  SelectInput,
  SubmitButton,
  TextInput,
} from "@/components/forms";
import { listAdminWorkspaces } from "@/server/services/platform-admin";

const roleOptions = [
  { value: "manager", label: "manager" },
  { value: "employee", label: "employee" },
];

export default async function AdminWorkspacesPage() {
  const workspaces = await listAdminWorkspaces();

  return (
    <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-950">创建工厂</h1>
        <p className="mt-1 text-sm text-slate-500">
          创建 workspace，并同时创建第一个客户账号。
        </p>
        <form
          action={createWorkspaceWithInitialAccountAction}
          className="mt-5 grid gap-4"
        >
          <TextInput label="工厂名称" name="workspaceName" required />
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
            defaultValue="manager"
            options={roleOptions}
            required
          />
          <SubmitButton>创建工厂</SubmitButton>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">工厂列表</h2>
        </div>
        {workspaces.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">暂无工厂。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">工厂名称</th>
                  <th className="px-4 py-3 text-right">账号数</th>
                  <th className="px-4 py-3">账号</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {workspaces.map((workspace) => (
                  <tr key={workspace.id} className="align-top">
                    <td className="px-4 py-4 font-medium text-slate-950">
                      {workspace.name}
                    </td>
                    <td className="px-4 py-4 text-right text-slate-950">
                      {workspace.users.length}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {workspace.users.length === 0
                        ? "-"
                        : workspace.users
                            .map((user) => `${user.displayName}(${user.role})`)
                            .join("、")}
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
