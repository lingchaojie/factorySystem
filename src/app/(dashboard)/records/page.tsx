import { OrderStatus, ProductionRecordType } from "@prisma/client";
import Link from "next/link";
import React from "react";
import {
  deleteRecordAction,
  updateRecordAction,
} from "@/app/actions/records";
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
import {
  OrderProgressBars,
  summarizeProgressRecords,
} from "@/components/order-progress-bars";
import { orderStatusLabels, StatusBadge } from "@/components/status-badge";
import {
  formatBusinessDateTime,
  formatDateTimeLocalValue,
} from "@/lib/business-time";
import { requireWorkspaceId } from "@/lib/workspace";
import { listProductionRecords } from "@/server/services/records";
import { DeleteRecordButton } from "./delete-record-button";
import { parseRecordFilters, type RecordSearchParams } from "./filters";

const statusOptions: Array<{ value: OrderStatus; label: string }> = [
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

const recordOrderStatusLabels: Record<OrderStatus, string> = {
  development_pending: `订单：${orderStatusLabels.development_pending}`,
  processing_pending: `订单：${orderStatusLabels.processing_pending}`,
  in_progress: `订单：${orderStatusLabels.in_progress}`,
  completed: `订单：${orderStatusLabels.completed}`,
};

const recordTypeLabels = {
  completed: "加工",
  shipped: "出货",
} as const;

const recordTypeOptions: Array<{ value: ProductionRecordType; label: string }> = [
  { value: "completed", label: recordTypeLabels.completed },
  { value: "shipped", label: recordTypeLabels.shipped },
];

function formatOrder(order: { customerName: string; partName: string }) {
  return `${order.customerName} / ${order.partName}`;
}

function formatUser(user: { displayName: string; username: string } | null) {
  return user ? user.displayName || user.username : "-";
}

function RecordTypeBadge({ type }: { type: keyof typeof recordTypeLabels }) {
  const className =
    type === "completed"
      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
      : "border-teal-200 bg-teal-50 text-teal-700";

  return (
    <span
      className={[
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium",
        className,
      ].join(" ")}
    >
      {recordTypeLabels[type]}
    </span>
  );
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<RecordSearchParams>;
}) {
  const workspaceId = await requireWorkspaceId();
  const params = await searchParams;
  const filters = parseRecordFilters(params);

  const records = await listProductionRecords(workspaceId, {
    type: filters.recordType,
    types: filters.recordTypes,
    orderId: filters.orderId,
    orderIds: filters.orderIds,
    orderQuery: filters.orderQuery,
    customerName: filters.customerName,
    orderStatus: filters.orderStatus,
    orderStatuses: filters.orderStatuses,
    from: filters.from,
    to: filters.to,
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
            记录
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            查询、修正和删除生产记录。
          </p>
        </div>
        <p className="text-sm text-slate-500">共 {records.length} 条</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <form
          className="grid gap-3 lg:grid-cols-[140px_140px_180px_minmax(180px,1fr)_minmax(160px,1fr)_180px_auto]"
          action="/records"
        >
          <DateInput
            label="日期从"
            name="from"
            defaultValue={filters.values.from ?? ""}
          />
          <DateInput
            label="日期至"
            name="to"
            defaultValue={filters.values.to ?? ""}
          />
          <MultiSelectInput
            label="记录类型"
            id="recordTypeFilter"
            name="type"
            selectedValues={filters.recordTypes ?? []}
            options={recordTypeOptions}
          />
          <TextInput
            label="订单"
            name="orderQuery"
            placeholder="客户 / 工件"
            defaultValue={filters.orderQuery}
          />
          <TextInput
            label="客户"
            name="customerName"
            placeholder="客户名称"
            defaultValue={filters.customerName}
          />
          <MultiSelectInput
            label="订单状态"
            name="status"
            selectedValues={filters.orderStatuses ?? []}
            options={statusOptions}
          />
          <div className="flex items-end">
            <SubmitButton className="w-full lg:w-auto">筛选</SubmitButton>
          </div>
        </form>
      </section>

      {records.length === 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">暂无记录</h2>
          <p className="mt-2 text-sm text-slate-500">
            通过机器详情页录入生产记录后，这里会显示查询和修改入口。
          </p>
        </section>
      ) : (
        <section className="grid gap-4">
          {records.map((record) => {
            const isCompleted = record.order.status === "completed";
            return (
              <article
                key={record.id}
                data-record-type={record.type}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-950">
                        {formatBusinessDateTime(record.recordedAt)}
                      </h2>
                      <RecordTypeBadge type={record.type} />
                    </div>
                    <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-[minmax(96px,0.7fr)_minmax(120px,0.9fr)_minmax(260px,1.6fr)_80px_minmax(96px,0.7fr)_minmax(96px,0.7fr)]">
                      <div className="min-w-0">
                        <dt className="text-slate-500">机器</dt>
                        <dd className="mt-1 font-medium text-slate-950">
                          <Link
                            href={`/machines/${record.machineId}`}
                            className="break-words hover:text-slate-600"
                          >
                            {record.machine.code}
                          </Link>
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-slate-500">客户</dt>
                        <dd className="mt-1 break-words font-medium text-slate-950">
                          {record.order.customerName}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-slate-500">订单</dt>
                        <dd className="mt-1 flex flex-col items-start gap-1 font-medium text-slate-950">
                          <Link
                            href={`/orders/${record.orderId}`}
                            className="break-words hover:text-slate-600"
                          >
                            {formatOrder(record.order)}
                          </Link>
                          <StatusBadge
                            status={record.order.status}
                            labels={recordOrderStatusLabels}
                          />
                          <OrderProgressBars
                            plannedQuantity={record.order.plannedQuantity}
                            {...summarizeProgressRecords(
                              record.order.productionRecords,
                            )}
                          />
                        </dd>
                      </div>
                      <div className="whitespace-nowrap">
                        <dt className="text-slate-500">数量</dt>
                        <dd className="mt-1 font-medium text-slate-950">
                          {record.quantity}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-slate-500">录入人</dt>
                        <dd className="mt-1 break-words font-medium text-slate-950">
                          {formatUser(record.createdByUser)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-slate-500">修改人</dt>
                        <dd className="mt-1 break-words font-medium text-slate-950">
                          {formatUser(record.updatedByUser)}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                      {record.notes || "无备注"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  {isCompleted ? (
                    <p className="mb-3 text-sm text-slate-500">
                      所属订单已完成，不能修改或删除记录。
                    </p>
                  ) : null}
                  <div className="sm:ml-auto">
                    <CreateEntityDialog
                      buttonLabel="修改"
                      title="修改记录"
                      buttonIcon="pencil"
                      buttonVariant="secondary"
                    >
                    <form
                      action={updateRecordAction}
                      className="grid gap-4"
                    >
                      <input type="hidden" name="recordId" value={record.id} />
                      <TextInput
                        id={`${record.id}-recordedAt`}
                        label="记录时间"
                        name="recordedAt"
                        type="datetime-local"
                        defaultValue={formatDateTimeLocalValue(record.recordedAt)}
                        disabled={isCompleted}
                      />
                      <SelectInput
                        id={`${record.id}-type`}
                        label="类型"
                        name="type"
                        defaultValue={record.type}
                        options={recordTypeOptions}
                        disabled={isCompleted}
                      />
                      <NumberInput
                        id={`${record.id}-quantity`}
                        label="数量"
                        name="quantity"
                        min={1}
                        step={1}
                        defaultValue={record.quantity}
                        disabled={isCompleted}
                      />
                      <Textarea
                        id={`${record.id}-notes`}
                        label="备注"
                        name="notes"
                        defaultValue={record.notes ?? ""}
                        disabled={isCompleted}
                      />
                      <SubmitButton disabled={isCompleted}>保存</SubmitButton>
                    </form>
                    <form action={deleteRecordAction} className="mt-3">
                      <input type="hidden" name="recordId" value={record.id} />
                      <DeleteRecordButton disabled={isCompleted} />
                    </form>
                    </CreateEntityDialog>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
