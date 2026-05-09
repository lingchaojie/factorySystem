import Link from "next/link";
import {
  closeOrderAction,
  reopenOrderAction,
} from "@/app/actions/orders";
import { SubmitButton } from "@/components/forms";
import {
  machineStatusLabels,
  orderStatusLabels,
  StatusBadge,
} from "@/components/status-badge";
import {
  formatBusinessDate,
  formatBusinessDateTime,
} from "@/lib/business-time";
import { requireWorkspaceId } from "@/lib/workspace";
import { getOrderWithSummary } from "@/server/services/orders";

function formatOrderTitle(order: { orderNo: string | null; partName: string }) {
  return order.orderNo ? `${order.orderNo} / ${order.partName}` : order.partName;
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspaceId = await requireWorkspaceId();
  const order = await getOrderWithSummary(workspaceId, id);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/orders"
            className="text-sm font-medium text-slate-500 hover:text-slate-950"
          >
            返回订单列表
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-950">
              {formatOrderTitle(order)}
            </h1>
            <StatusBadge status={order.status} labels={orderStatusLabels} />
          </div>
          <p className="mt-2 text-sm text-slate-500">{order.customerName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.canClose ? (
            <form action={closeOrderAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <SubmitButton>手动结单</SubmitButton>
            </form>
          ) : null}
          {order.status === "closed" ? (
            <form action={reopenOrderAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <SubmitButton>重开订单</SubmitButton>
            </form>
          ) : null}
        </div>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="计划数量" value={order.plannedQuantity} />
        <Metric label="加工数量" value={order.completedQuantity} />
        <Metric label="出货数量" value={order.shippedQuantity} />
        <Metric label="剩余数量" value={order.remainingQuantity} />
        <Metric label="当前机器" value={order.currentMachines.length} />
      </dl>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">订单信息</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">订单号</dt>
                <dd className="mt-1 font-medium text-slate-950">
                  {order.orderNo || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">工件名称</dt>
                <dd className="mt-1 font-medium text-slate-950">
                  {order.partName}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">交期</dt>
                <dd className="mt-1 text-slate-950">
                  {order.dueDate ? formatBusinessDate(order.dueDate) : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">创建时间</dt>
                <dd className="mt-1 text-slate-950">
                  {formatBusinessDateTime(order.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">结单时间</dt>
                <dd className="mt-1 text-slate-950">
                  {order.closedAt ? formatBusinessDateTime(order.closedAt) : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">状态提示</dt>
                <dd className="mt-1 text-slate-950">
                  {order.isOverPlanned
                    ? "生产或出货已超出计划"
                    : order.canClose
                      ? "已满足结单条件"
                      : "未满足结单条件"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">备注</dt>
                <dd className="mt-1 whitespace-pre-wrap text-slate-950">
                  {order.notes || "-"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-950">
                生产记录
              </h2>
            </div>
            {order.productionRecords.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                当前订单还没有生产记录。
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">记录时间</th>
                      <th className="px-4 py-3">机器</th>
                      <th className="px-4 py-3 text-right">加工</th>
                      <th className="px-4 py-3 text-right">出货</th>
                      <th className="px-4 py-3">备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {order.productionRecords.map((record) => (
                      <tr key={record.id}>
                        <td className="whitespace-nowrap px-4 py-4 text-slate-950">
                          {formatBusinessDateTime(record.recordedAt)}
                        </td>
                        <td className="px-4 py-4 text-slate-950">
                          {record.machine.code} / {record.machine.name}
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-slate-950">
                          {record.completedQuantity}
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-slate-950">
                          {record.shippedQuantity}
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {record.notes || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">当前机器</h2>
          {order.currentMachines.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              当前没有机器关联到此订单。
            </p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {order.currentMachines.map((machine) => (
                <div key={machine.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/machines/${machine.id}`}
                        className="font-medium text-slate-950 hover:text-slate-700"
                      >
                        {machine.code} / {machine.name}
                      </Link>
                      <div className="mt-1 text-xs text-slate-500">
                        {[machine.model, machine.location]
                          .filter(Boolean)
                          .join(" / ") || "未填写型号和位置"}
                      </div>
                    </div>
                    <StatusBadge
                      status={machine.status}
                      labels={machineStatusLabels}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
