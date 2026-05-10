import type { MachineStatus } from "@prisma/client";
import Link from "next/link";
import React from "react";
import {
  createMachineRecordAction,
  deleteMachineAction,
  linkMachineAction,
  updateMachineAction,
} from "@/app/actions/machines";
import { CreateEntityDialog } from "@/components/create-entity-dialog";
import {
  NumberInput,
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
import {
  formatBusinessDateTime,
  formatDateTimeLocalValue,
} from "@/lib/business-time";
import { requireUser } from "@/lib/auth";
import { getMachine } from "@/server/services/machines";
import { listOrders } from "@/server/services/orders";
import { DeleteMachineButton } from "./delete-machine-button";

function formatOrder(order: { customerName: string; partName: string }) {
  return `${order.customerName} / ${order.partName}`;
}

function formatUser(user: { displayName: string; username: string } | null) {
  return user ? user.displayName || user.username : "-";
}

const recordTypeLabels = {
  completed: "加工",
  shipped: "出货",
} as const;

const machineStatusOptions: Array<{ value: MachineStatus; label: string }> = [
  { value: "active", label: machineStatusLabels.active },
  { value: "idle", label: machineStatusLabels.idle },
  { value: "maintenance", label: machineStatusLabels.maintenance },
  { value: "disabled", label: machineStatusLabels.disabled },
];

type RecordSort = "recordedAt" | "order";
type RecordDirection = "asc" | "desc";

function parseRecordSort(value: string | string[] | undefined): RecordSort {
  return value === "order" ? "order" : "recordedAt";
}

function parseRecordDirection(
  value: string | string[] | undefined,
): RecordDirection {
  return value === "asc" ? "asc" : "desc";
}

function compareOrders(
  a: { customerName: string; partName: string },
  b: { customerName: string; partName: string },
) {
  return formatOrder(a).localeCompare(formatOrder(b), "zh-CN");
}

function sortProductionRecords<
  T extends { recordedAt: Date; order: { customerName: string; partName: string } },
>(records: T[], sort: RecordSort, direction: RecordDirection) {
  const sorted = [...records].sort((a, b) => {
    const comparison =
      sort === "order"
        ? compareOrders(a.order, b.order) ||
          b.recordedAt.getTime() - a.recordedAt.getTime()
        : a.recordedAt.getTime() - b.recordedAt.getTime() ||
          compareOrders(a.order, b.order);

    return direction === "asc" ? comparison : -comparison;
  });

  return sorted;
}

function getShipmentProgress(order: {
  status: string;
  plannedQuantity?: number | null;
  productionRecords?: Array<{ type: string; quantity: number }>;
}) {
  if (order.status !== "in_progress" || !order.plannedQuantity) return null;

  const shippedQuantity =
    order.productionRecords?.reduce(
      (total, record) =>
        record.type === "shipped" ? total + record.quantity : total,
      0,
    ) ?? 0;
  const percent = Math.min(
    Math.round((shippedQuantity / order.plannedQuantity) * 100),
    100,
  );

  return {
    shippedQuantity,
    plannedQuantity: order.plannedQuantity,
    percent,
  };
}

function buildRecordSortHref(
  machineId: string,
  sort: RecordSort,
  currentSort: RecordSort,
  currentDirection: RecordDirection,
) {
  const nextDirection =
    sort === currentSort && currentDirection === "asc" ? "desc" : "asc";
  return `/machines/${machineId}?recordSort=${sort}&recordDirection=${nextDirection}`;
}

function SortableRecordHeader({
  machineId,
  label,
  sort,
  currentSort,
  currentDirection,
}: {
  machineId: string;
  label: string;
  sort: RecordSort;
  currentSort: RecordSort;
  currentDirection: RecordDirection;
}) {
  const active = sort === currentSort;
  const nextDirection =
    active && currentDirection === "asc" ? "倒序" : "正序";
  const ariaLabel = active
    ? `${label}${currentDirection === "asc" ? "正序" : "倒序"}，点击切换为${nextDirection}`
    : `${label}排序，点击切换为正序`;

  return (
    <Link
      href={buildRecordSortHref(machineId, sort, currentSort, currentDirection)}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-sm text-slate-600 transition hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-300"
    >
      <span aria-hidden="true">{label}</span>
      <span
        aria-hidden="true"
        className="inline-flex flex-col text-[9px] leading-[8px]"
      >
        <span
          className={
            active && currentDirection === "asc"
              ? "text-slate-950"
              : "text-slate-300"
          }
        >
          ▲
        </span>
        <span
          className={
            active && currentDirection === "desc"
              ? "text-slate-950"
              : "text-slate-300"
          }
        >
          ▼
        </span>
      </span>
    </Link>
  );
}

export default async function MachineDetailPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    recordSort?: string | string[];
    recordDirection?: string | string[];
  }>;
}) {
  const { id } = await params;
  const sortParams = await searchParams;
  const user = await requireUser();
  const [machine, orders] = await Promise.all([
    getMachine(user.workspaceId, id),
    listOrders(user.workspaceId, {}),
  ]);
  const recordSort = parseRecordSort(sortParams.recordSort);
  const recordDirection = parseRecordDirection(sortParams.recordDirection);
  const productionRecords = sortProductionRecords(
    machine.productionRecords,
    recordSort,
    recordDirection,
  );
  const canManageMachines = user.role === "manager";
  const availableOrders = orders.filter((order) => order.status !== "completed");
  const hasCurrentOrder = Boolean(machine.currentOrderId);
  const canRecordCurrentOrder = Boolean(
    machine.currentOrder && machine.currentOrder.status !== "completed",
  );
  const currentOrderProgress = machine.currentOrder
    ? getShipmentProgress(machine.currentOrder)
    : null;
  const orderOptions = availableOrders.map((order) => ({
    value: order.id,
    label: formatOrder(order),
  }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/machines"
            className="text-sm font-medium text-slate-500 hover:text-slate-950"
          >
            返回机器列表
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-950">
              {machine.code}
            </h1>
            <StatusBadge status={machine.status} labels={machineStatusLabels} />
          </div>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-950">
                机器信息
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <CreateEntityDialog
                  buttonLabel="编辑机器"
                  title="编辑机器"
                  buttonIcon="pencil"
                  buttonVariant="secondary"
                >
                  <div className="grid gap-4">
                    <form action={updateMachineAction} className="grid gap-4">
                      <input type="hidden" name="machineId" value={machine.id} />
                      <SelectInput
                        label="机器状态"
                        id="editMachineStatus"
                        name="status"
                        defaultValue={machine.status}
                        options={machineStatusOptions}
                      />
                      <Textarea
                        label="机器备注"
                        id="editMachineNotes"
                        name="notes"
                        defaultValue={machine.notes ?? ""}
                      />
                      <SubmitButton>保存机器</SubmitButton>
                    </form>
                    {canManageMachines ? (
                      <form
                        action={deleteMachineAction}
                        className="border-t border-slate-200 pt-4"
                      >
                        <input type="hidden" name="machineId" value={machine.id} />
                        <DeleteMachineButton />
                      </form>
                    ) : null}
                  </div>
                </CreateEntityDialog>
              </div>
            </div>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">机器名称</dt>
                <dd className="mt-1 font-medium text-slate-950">
                  {machine.code}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">备注</dt>
                <dd className="mt-1 whitespace-pre-wrap text-slate-950">
                  {machine.notes || "-"}
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
            {productionRecords.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                当前机器还没有生产记录。
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">
                        <SortableRecordHeader
                          machineId={machine.id}
                          label="记录时间"
                          sort="recordedAt"
                          currentSort={recordSort}
                          currentDirection={recordDirection}
                        />
                      </th>
                      <th className="px-4 py-3">
                        <SortableRecordHeader
                          machineId={machine.id}
                          label="订单"
                          sort="order"
                          currentSort={recordSort}
                          currentDirection={recordDirection}
                        />
                      </th>
                      <th className="whitespace-nowrap px-4 py-3">类型</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">
                        数量
                      </th>
                      <th className="whitespace-nowrap px-4 py-3">录入人</th>
                      <th className="whitespace-nowrap px-4 py-3">修改人</th>
                      <th className="px-4 py-3">备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {productionRecords.map((record) => (
                      <tr key={record.id}>
                        <td className="whitespace-nowrap px-4 py-4 text-slate-950">
                          {formatBusinessDateTime(record.recordedAt)}
                        </td>
                        <td className="px-4 py-4 text-slate-950">
                          <Link
                            href={`/orders/${record.order.id}`}
                            className="font-medium text-slate-950 underline-offset-4 hover:underline"
                          >
                            {formatOrder(record.order)}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-slate-950">
                          {recordTypeLabels[record.type]}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-slate-950">
                          {record.quantity}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-slate-950">
                          {formatUser(record.createdByUser)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-slate-950">
                          {formatUser(record.updatedByUser)}
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

        <aside className="grid content-start gap-6 pb-24 md:pb-0">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">关联订单</h2>
            {machine.currentOrder ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="text-slate-500">当前订单</span>
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
                {currentOrderProgress ? (
                  <div className="flex min-w-[180px] items-center gap-2">
                    <div
                      aria-label="当前订单出货进度"
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={currentOrderProgress.percent}
                      className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      title={`出货 ${currentOrderProgress.shippedQuantity} / ${currentOrderProgress.plannedQuantity}`}
                    >
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${currentOrderProgress.percent}%` }}
                      />
                    </div>
                    <span className="whitespace-nowrap text-xs font-medium text-emerald-700">
                      {currentOrderProgress.percent}% 出货{" "}
                      {currentOrderProgress.shippedQuantity} /{" "}
                      {currentOrderProgress.plannedQuantity}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {availableOrders.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                当前没有未完成的订单。请先在订单流程中创建订单。
              </p>
            ) : (
              <form action={linkMachineAction} className="mt-4 grid gap-4">
                <input type="hidden" name="machineId" value={machine.id} />
                <SelectInput
                  label="可关联订单"
                  name="orderId"
                  defaultValue={machine.currentOrderId ?? availableOrders[0]?.id}
                  options={orderOptions}
                  required
                />
                <SubmitButton>保存关联</SubmitButton>
              </form>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">录入记录</h2>
            {!hasCurrentOrder ? (
              <p className="mt-3 text-sm text-slate-500">
                这台机器未关联订单，不能录入生产记录。
              </p>
            ) : null}
            {hasCurrentOrder && !canRecordCurrentOrder ? (
              <p className="mt-3 text-sm text-slate-500">
                当前订单已完成，请关联未完成的订单后再录入。
              </p>
            ) : null}
            <form action={createMachineRecordAction} className="mt-4 grid gap-4">
              <input type="hidden" name="machineId" value={machine.id} />
              <TextInput
                label="记录时间"
                name="recordedAt"
                type="datetime-local"
                defaultValue={formatDateTimeLocalValue()}
                disabled={!canRecordCurrentOrder}
              />
              <NumberInput
                label="加工数量"
                name="completedQuantity"
                min={0}
                step={1}
                defaultValue={0}
                disabled={!canRecordCurrentOrder}
              />
              <NumberInput
                label="出货数量"
                name="shippedQuantity"
                min={0}
                step={1}
                defaultValue={0}
                disabled={!canRecordCurrentOrder}
              />
              <Textarea
                label="备注"
                name="notes"
                disabled={!canRecordCurrentOrder}
              />
              <SubmitButton disabled={!canRecordCurrentOrder}>保存记录</SubmitButton>
            </form>
          </section>
        </aside>
      </section>
    </div>
  );
}
