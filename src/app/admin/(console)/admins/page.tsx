import { createPlatformAdminAction } from "@/app/admin/actions";
import { SubmitButton, TextInput } from "@/components/forms";
import { listPlatformAdmins } from "@/server/services/platform-admin";

export default async function AdminAdminsPage() {
  const admins = await listPlatformAdmins();

  return (
    <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-950">创建运维账号</h1>
        <p className="mt-1 text-sm text-slate-500">
          运维账号只能登录 /admin，用于管理工厂和客户账号。
        </p>
        <form action={createPlatformAdminAction} className="mt-5 grid gap-4">
          <TextInput label="账号" name="username" required />
          <TextInput label="姓名" name="displayName" required />
          <TextInput
            label="初始密码"
            name="password"
            type="password"
            required
          />
          <SubmitButton>创建运维账号</SubmitButton>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">运维账号</h2>
        </div>
        {admins.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">暂无运维账号。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">账号</th>
                  <th className="px-4 py-3">姓名</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {admins.map((admin) => (
                  <tr key={admin.id}>
                    <td className="px-4 py-4 font-medium text-slate-950">
                      {admin.username}
                    </td>
                    <td className="px-4 py-4 text-slate-950">
                      {admin.displayName}
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
