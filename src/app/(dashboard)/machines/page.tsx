import { MachineStatus } from "@prisma/client";
import Link from "next/link";
import {
  createMachineAction,
} from "@/app/actions/machines";
import {
  SelectInput,
  SubmitButton,
  Textarea,
  TextInput,
} from "@/components/forms";
import {
  machineStatusLabels,
  orderStatusLabels,
  StatusBadge,
} from "@/components/status-badge";
import { businessTodayBounds } from "@/lib/business-time";
import { requireWorkspaceId } from "@/lib/workspace";
import { listMachines } from "@/server/services/machines";

const statusOptions: Array<{ value: MachineStatus | ""; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "active", label: machineStatusLabels.active },
  { value: "idle", label: machineStatusLabels.idle },
  { value: "maintenance", label: machineStatusLabels.maintenance },
  { value: "disabled", label: machineStatusLabels.disabled },
];

function parseStatus(value: string | undefined): MachineStatus | undefined {
  if (!value) return undefined;
  return value in machineStatusLabels ? (value as MachineStatus) : undefined;
}

function formatOrder(order: { orderNo: string; partName: string }) {
  return `${order.orderNo} / ${order.partName}`;
}

export default async function MachinesPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; status?: string }>;
}) {
  const workspaceId = await requireWorkspaceId();
  const params = await searchParams;
  const query = params.query?.trim() ?? "";
  const status = parseStatus(params.status);
  const machines = await listMachines(workspaceId, { query, status });
  const { start, end } = businessTodayBounds();

  const machinesWithToday = machines.map((machine) => {
    const todayRecords = machine.productionRecords.filter(
      (record) => record.recordedAt >= start && record.recordedAt < end,
    );
    return {
      ...machine,
      todayCompletedQuantity: todayRecords.reduce(
        (total, record) => total + record.completedQuantity,
        0,
      ),
      todayShippedQuantity: todayRecords.reduce(
        (total, record) => total + record.shippedQuantity,
        0,
      ),
    };
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
            机器
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            查看机器状态、当前订单和今日产出。
          </p>
        </div>
        <p className="text-sm text-slate-500">共 {machines.length} 台</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <form className="grid gap-3 md:grid-cols-[1fr_180px_auto]" action="/machines">
          <TextInput
            label="搜索"
            name="query"
            placeholder="机器编号或名称"
            defaultValue={query}
          />
          <SelectInput
            label="状态"
            name="status"
            defaultValue={status ?? ""}
            options={statusOptions}
          />
          <div className="flex items-end">
            <SubmitButton className="w-full md:w-auto">筛选</SubmitButton>
          </div>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
          {machinesWithToday.length === 0 ? (
            <div className="p-8 text-center">
              <h2 className="text-base font-semibold text-slate-950">
                暂无机器
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                新增机器后，这里会显示当前订单和今日加工、出货数量。
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">机器</th>
                    <th className="whitespace-nowrap px-4 py-3">状态</th>
                    <th className="px-4 py-3">当前订单</th>
                    <th className="px-4 py-3 text-right">今日加工</th>
                    <th className="px-4 py-3 text-right">今日出货</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {machinesWithToday.map((machine) => (
                    <tr key={machine.id} className="align-top">
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-950">
                          {machine.code}
                        </div>
                        <div className="mt-1 text-slate-600">{machine.name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {[machine.model, machine.location]
                            .filter(Boolean)
                            .join(" / ") || "未填写型号和位置"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <StatusBadge
                          status={machine.status}
                          labels={machineStatusLabels}
                        />
                      </td>
                      <td className="px-4 py-4">
                        {machine.currentOrder ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/orders/${machine.currentOrder.id}`}
                              className="font-medium text-slate-950 underline-offset-4 hover:underline"
                            >
                              {formatOrder(machine.currentOrder)}
                            </Link>
                            <StatusBadge
                              status={machine.currentOrder.status}
                              labels={orderStatusLabels}
                            />
                          </div>
                        ) : (
                          <span className="text-slate-400">未关联订单</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-slate-950">
                        {machine.todayCompletedQuantity}
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-slate-950">
                        {machine.todayShippedQuantity}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right">
                        <Link
                          href={`/machines/${machine.id}`}
                          className="inline-flex whitespace-nowrap rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          详情
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">新增机器</h2>
          <form action={createMachineAction} className="mt-4 grid gap-4">
            <TextInput label="机器编号" name="code" required />
            <TextInput label="机器名称" name="name" required />
            <TextInput label="型号" name="model" />
            <TextInput label="位置" name="location" />
            <SelectInput
              label="状态"
              name="status"
              defaultValue="active"
              options={statusOptions.filter((option) => option.value)}
            />
            <Textarea label="备注" name="notes" />
            <SubmitButton>创建机器</SubmitButton>
          </form>
        </aside>
      </section>
    </div>
  );
}
