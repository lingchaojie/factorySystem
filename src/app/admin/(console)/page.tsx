import Link from "next/link";
import { listAdminDashboard } from "@/server/services/platform-admin";

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const dashboard = await listAdminDashboard();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
          工作台
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          查看工厂、客户账号和平台运维账号概览。
        </p>
      </header>

      <dl className="grid gap-4 sm:grid-cols-3">
        <Metric label="工厂数量" value={dashboard.workspaceCount} />
        <Metric label="客户账号" value={dashboard.customerUserCount} />
        <Metric label="运维账号" value={dashboard.platformAdminCount} />
      </dl>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">最近工厂</h2>
          <Link
            href="/admin/workspaces"
            className="text-sm font-medium text-slate-700 hover:text-slate-950"
          >
            管理工厂
          </Link>
        </div>
        {dashboard.workspaces.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            暂无工厂，请先创建 workspace 和初始账号。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">工厂名称</th>
                  <th className="px-4 py-3 text-right">账号数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {dashboard.workspaces.map((workspace) => (
                  <tr key={workspace.id}>
                    <td className="px-4 py-4 font-medium text-slate-950">
                      {workspace.name}
                    </td>
                    <td className="px-4 py-4 text-right text-slate-950">
                      {workspace.users.length}
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
