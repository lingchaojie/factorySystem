import Link from "next/link";
import { Archive, FileText, Folder } from "lucide-react";
import React from "react";
import {
  deleteOrderAction,
  updateOrderDetailsAction,
} from "@/app/actions/orders";
import { CreateEntityDialog } from "@/components/create-entity-dialog";
import {
  DateInput,
  MultiSelectInput,
  NumberInput,
  SelectInput,
  SubmitButton,
  Textarea,
  TextInput,
} from "@/components/forms";
import { OrderProgressBars } from "@/components/order-progress-bars";
import {
  machineStatusLabels,
  orderStatusLabels,
  StatusBadge,
} from "@/components/status-badge";
import { formatCnyFromCents, getOrderAmountCents } from "@/domain/money";
import {
  formatBusinessDate,
  formatBusinessDateTime,
  formatDateTimeLocalValue,
} from "@/lib/business-time";
import { requireUser } from "@/lib/auth";
import { getOrderWithSummary } from "@/server/services/orders";
import { DeleteOrderButton } from "./delete-order-button";
import { OrderDrawingUpload } from "./order-drawing-upload";

type Drawing = {
  id: string;
  originalName: string;
  relativePath: string;
  sizeBytes: number;
};

type DrawingFolder = {
  name: string;
  path: string;
  folders: Map<string, DrawingFolder>;
  files: Drawing[];
};

function formatOrderTitle(order: { customerName: string; partName: string }) {
  return `${order.customerName} / ${order.partName}`;
}

function formatUser(
  user: { displayName: string; username: string } | null | undefined,
) {
  return user ? user.displayName || user.username : "-";
}

const orderStatusOptions = [
  {
    value: "development_pending",
    label: orderStatusLabels.development_pending,
  },
  {
    value: "processing_pending",
    label: orderStatusLabels.processing_pending,
  },
  { value: "in_progress", label: orderStatusLabels.in_progress },
  { value: "completed", label: orderStatusLabels.completed },
];

const recordTypeLabels = {
  completed: "加工",
  shipped: "出货",
} as const;

type RecordDirection = "asc" | "desc";

function parseRecordDirection(
  value: string | string[] | undefined,
): RecordDirection {
  return value === "asc" ? "asc" : "desc";
}

function uniqueValues(
  value: string | string[] | undefined,
  allowedValues: Set<string>,
) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const item of values) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized) || !allowedValues.has(normalized)) {
      continue;
    }
    selected.push(normalized);
    seen.add(normalized);
  }

  return selected;
}

function sortProductionRecords<
  T extends { recordedAt: Date; machine: { code: string } },
>(records: T[], direction: RecordDirection) {
  return [...records].sort((a, b) => {
    const comparison =
      a.recordedAt.getTime() - b.recordedAt.getTime() ||
      a.machine.code.localeCompare(b.machine.code, "zh-CN");

    return direction === "asc" ? comparison : -comparison;
  });
}

function buildRecordSortHref({
  orderId,
  machineIds,
  currentDirection,
}: {
  orderId: string;
  machineIds: string[];
  currentDirection: RecordDirection;
}) {
  const params = new URLSearchParams();
  for (const machineId of machineIds) {
    params.append("machineId", machineId);
  }
  params.set("recordSort", "recordedAt");
  params.set(
    "recordDirection",
    currentDirection === "asc" ? "desc" : "asc",
  );
  return `/orders/${orderId}?${params.toString()}`;
}

function SortableRecordTimeHeader({
  orderId,
  machineIds,
  currentDirection,
}: {
  orderId: string;
  machineIds: string[];
  currentDirection: RecordDirection;
}) {
  const nextDirection = currentDirection === "asc" ? "倒序" : "正序";

  return (
    <Link
      href={buildRecordSortHref({ orderId, machineIds, currentDirection })}
      aria-label={`记录时间${currentDirection === "asc" ? "正序" : "倒序"}，点击切换为${nextDirection}`}
      className="inline-flex items-center gap-1 rounded-sm text-slate-600 transition hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-300"
    >
      <span aria-hidden="true">记录时间</span>
      <span
        aria-hidden="true"
        className="inline-flex flex-col text-[9px] leading-[8px]"
      >
        <span
          className={
            currentDirection === "asc" ? "text-slate-950" : "text-slate-300"
          }
        >
          ▲
        </span>
        <span
          className={
            currentDirection === "desc" ? "text-slate-950" : "text-slate-300"
          }
        >
          ▼
        </span>
      </span>
    </Link>
  );
}

function formatQuantity(value: number | string | null) {
  return value === null ? "-" : value;
}

function formatUnitPriceInput(value: number | null) {
  return value === null ? "" : String(value / 100);
}

function formatDateInputValue(date: Date | null) {
  return date ? formatDateTimeLocalValue(date).slice(0, 10) : "";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createFolder(name: string, folderPath: string): DrawingFolder {
  return {
    name,
    path: folderPath,
    folders: new Map(),
    files: [],
  };
}

function buildDrawingTree(drawings: Drawing[]) {
  const root = createFolder("", "");
  for (const drawing of drawings) {
    const parts = drawing.relativePath.split("/").filter(Boolean);
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      const childPath = folder.path ? `${folder.path}/${part}` : part;
      let child = folder.folders.get(part);
      if (!child) {
        child = createFolder(part, childPath);
        folder.folders.set(part, child);
      }
      folder = child;
    }
    folder.files.push(drawing);
  }
  return root;
}

function archiveHref(orderId: string, prefix = "") {
  const params = new URLSearchParams({ orderId });
  if (prefix) params.set("prefix", prefix);
  return `/api/order-drawings/archive?${params.toString()}`;
}

function sortFolders(folders: Iterable<DrawingFolder>) {
  return Array.from(folders).sort((left, right) =>
    left.name.localeCompare(right.name, "zh-CN"),
  );
}

function sortFiles(files: Drawing[]) {
  return [...files].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "zh-CN"),
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | string | null;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <dt className="text-sm text-slate-500">{label}</dt>
            <dd className="mt-2 text-2xl font-semibold text-slate-950">
              {formatQuantity(value)}
            </dd>
    </div>
  );
}

function DrawingTree({
  folder,
  orderId,
  depth = 0,
}: {
  folder: DrawingFolder;
  orderId: string;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? "mt-4 space-y-1" : "mt-1 space-y-1"}>
      {sortFolders(folder.folders.values()).map((child) => (
        <li key={child.path}>
          <div
            className="flex min-h-9 items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
            style={{ paddingLeft: depth * 18 + 8 }}
          >
            <Link
              href={archiveHref(orderId, child.path)}
              className="inline-flex min-w-0 items-center gap-2 font-medium text-slate-950 underline-offset-4 hover:underline"
            >
              <Folder aria-hidden="true" size={16} />
              <span className="truncate">{child.name}</span>
            </Link>
          </div>
          <DrawingTree folder={child} orderId={orderId} depth={depth + 1} />
        </li>
      ))}
      {sortFiles(folder.files).map((drawing) => (
        <li key={drawing.id}>
          <div
            className="flex min-h-9 items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
            style={{ paddingLeft: depth * 18 + 8 }}
          >
            <Link
              href={`/api/order-drawings/${drawing.id}`}
              className="inline-flex min-w-0 items-center gap-2 text-slate-950 underline-offset-4 hover:underline"
            >
              <FileText aria-hidden="true" size={16} />
              <span className="truncate">{drawing.originalName}</span>
            </Link>
            <span className="shrink-0 text-xs text-slate-500">
              {formatFileSize(drawing.sizeBytes)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function OrderDetailPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    machineId?: string | string[];
    recordSort?: string | string[];
    recordDirection?: string | string[];
  }>;
}) {
  const { id } = await params;
  const recordParams = await searchParams;
  const user = await requireUser();
  const canManageOrders = user.role === "manager";
  const order = await getOrderWithSummary(user.workspaceId, id);
  const drawingTree = buildDrawingTree(order.drawings);
  const recordDirection = parseRecordDirection(recordParams.recordDirection);
  const machineOptions = Array.from(
    new Map(
      order.productionRecords.map((record) => [
        record.machine.id,
        {
          value: record.machine.id,
          label: record.machine.code,
        },
      ]),
    ).values(),
  ).sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  const selectedMachineIds = uniqueValues(
    recordParams.machineId,
    new Set(machineOptions.map((option) => option.value)),
  );
  const selectedMachineSet = new Set(selectedMachineIds);
  const filteredProductionRecords =
    selectedMachineSet.size > 0
      ? order.productionRecords.filter((record) =>
          selectedMachineSet.has(record.machine.id),
        )
      : order.productionRecords;
  const productionRecords = sortProductionRecords(
    filteredProductionRecords,
    recordDirection,
  );

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
            <OrderProgressBars
              plannedQuantity={order.plannedQuantity}
              completedQuantity={order.completedQuantity}
              shippedQuantity={order.shippedQuantity}
            />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {order.notes || "无备注"}
          </p>
        </div>
        {canManageOrders ? (
          <div className="flex flex-wrap gap-2">
            <CreateEntityDialog
              buttonLabel="编辑订单"
              title="编辑订单"
              buttonIcon="pencil"
            >
              <div className="grid gap-4">
                <form action={updateOrderDetailsAction} className="grid gap-4">
                  <input type="hidden" name="orderId" value={order.id} />
                  <TextInput
                    label="客户名称"
                    id="editCustomerName"
                    name="customerName"
                    defaultValue={order.customerName}
                    required
                  />
                  <TextInput
                    label="工件名称"
                    id="editPartName"
                    name="partName"
                    defaultValue={order.partName}
                    required
                  />
                  <NumberInput
                    label="计划数量"
                    id="editPlannedQuantity"
                    name="plannedQuantity"
                    min={1}
                    step={1}
                    defaultValue={order.plannedQuantity ?? ""}
                  />
                  <NumberInput
                    label="单价（元/件）"
                    id="editUnitPrice"
                    name="unitPrice"
                    min={0}
                    step={0.01}
                    defaultValue={formatUnitPriceInput(order.unitPriceCents)}
                  />
                  <DateInput
                    label="交期"
                    id="editDueDate"
                    name="dueDate"
                    defaultValue={formatDateInputValue(order.dueDate)}
                  />
                  <SelectInput
                    label="订单状态"
                    id="editOrderStatus"
                    name="status"
                    defaultValue={order.status}
                    options={orderStatusOptions}
                    required
                  />
                  <Textarea
                    label="备注"
                    id="editOrderNotes"
                    name="notes"
                    defaultValue={order.notes ?? ""}
                  />
                  <SubmitButton>保存订单</SubmitButton>
                </form>
                <form
                  action={deleteOrderAction}
                  className="border-t border-slate-200 pt-4"
                >
                  <input type="hidden" name="orderId" value={order.id} />
                  <DeleteOrderButton />
                </form>
              </div>
            </CreateEntityDialog>
          </div>
        ) : null}
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
                <dt className="text-slate-500">客户名称</dt>
                <dd className="mt-1 font-medium text-slate-950">
                  {order.customerName}
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
                <dt className="text-slate-500">创建日期</dt>
                <dd className="mt-1 text-slate-950">
                  {formatBusinessDate(order.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">创建人</dt>
                <dd className="mt-1 text-slate-950">
                  {formatUser(order.createdByUser)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">上次修改人</dt>
                <dd className="mt-1 text-slate-950">
                  {formatUser(order.updatedByUser)}
                </dd>
              </div>
              {canManageOrders ? (
                <>
                  <div>
                    <dt className="text-slate-500">单价</dt>
                    <dd className="mt-1 text-slate-950">
                      {formatCnyFromCents(order.unitPriceCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">订单金额</dt>
                    <dd className="mt-1 text-slate-950">
                      {formatCnyFromCents(
                        getOrderAmountCents(
                          order.unitPriceCents,
                          order.plannedQuantity,
                        ),
                      )}
                    </dd>
                  </div>
                </>
              ) : null}
              <div>
                <dt className="text-slate-500">完成时间</dt>
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
                      ? "出货已达到计划"
                      : "继续跟踪"}
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

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  图纸文件
                </h2>
                {canManageOrders ? (
                  <p className="mt-1 text-sm text-slate-500">
                    重新上传会覆盖原有图纸
                  </p>
                ) : null}
              </div>
              <span className="text-sm text-slate-500">
                {order.drawings.length} 个文件
              </span>
            </div>

            {order.drawings.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                当前订单还没有上传图纸。
              </p>
            ) : (
              <div>
                <Link
                  href={archiveHref(order.id)}
                  className="mt-4 inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Archive aria-hidden="true" size={16} />
                  下载全部图纸
                </Link>
                <DrawingTree folder={drawingTree} orderId={order.id} />
              </div>
            )}

            {canManageOrders ? <OrderDrawingUpload orderId={order.id} /> : null}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
              <h2 className="text-base font-semibold text-slate-950">
                生产记录
              </h2>
              {machineOptions.length > 0 ? (
                <form
                  action={`/orders/${order.id}`}
                  className="grid gap-3 sm:grid-cols-[minmax(180px,260px)_auto]"
                >
                  <input type="hidden" name="recordSort" value="recordedAt" />
                  <input
                    type="hidden"
                    name="recordDirection"
                    value={recordDirection}
                  />
                  <MultiSelectInput
                    label="机器"
                    id="orderRecordMachineFilter"
                    name="machineId"
                    selectedValues={selectedMachineIds}
                    options={machineOptions}
                  />
                  <div className="flex items-end">
                    <SubmitButton className="w-full sm:w-auto">
                      筛选
                    </SubmitButton>
                  </div>
                </form>
              ) : null}
            </div>
            {order.productionRecords.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                当前订单还没有生产记录。
              </div>
            ) : productionRecords.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                当前筛选条件下没有生产记录。
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">
                        <SortableRecordTimeHeader
                          orderId={order.id}
                          machineIds={selectedMachineIds}
                          currentDirection={recordDirection}
                        />
                      </th>
                      <th className="px-4 py-3">机器</th>
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
                          {record.machine.code}
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
                        {machine.code}
                      </Link>
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
