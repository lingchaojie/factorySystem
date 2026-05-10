import { OrderStatus } from "@prisma/client";
import Link from "next/link";
import React from "react";
import { createOrderAction } from "@/app/actions/orders";
import { CreateEntityDialog } from "@/components/create-entity-dialog";
import {
  DateInput,
  MultiSelectInput,
  NumberInput,
  SubmitButton,
  Textarea,
  TextInput,
} from "@/components/forms";
import { orderStatusLabels, StatusBadge } from "@/components/status-badge";
import { formatCnyFromCents, getOrderAmountCents } from "@/domain/money";
import {
  businessDateRange,
  formatBusinessDate,
} from "@/lib/business-time";
import { requireUser } from "@/lib/auth";
import { listOrders } from "@/server/services/orders";
import { parseOrderStatusFilters } from "./filters";

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

function parseDateRange(value: string | undefined, label: string) {
  if (!value) return undefined;
  const range = businessDateRange(value);
  if (Number.isNaN(range.start.getTime())) {
    throw new Error(`${label}无效`);
  }
  return range;
}

function formatOrderTitle(order: { orderNo: string; partName: string }) {
  return `${order.orderNo} / ${order.partName}`;
}

function formatQuantity(value: number | null) {
  return value === null ? "-" : value;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    customerName?: string;
    query?: string;
    status?: string | string[];
    dueDateFrom?: string;
    dueDateTo?: string;
  }>;
}) {
  const user = await requireUser();
  const canManageOrders = user.role === "manager";
  const params = await searchParams;
  const customerName = params.customerName?.trim() ?? "";
  const query = params.query?.trim() ?? "";
  const statuses = parseOrderStatusFilters(params.status);
  const dueDateFrom = parseDateRange(params.dueDateFrom, "开始交期");
  const dueDateTo = parseDateRange(params.dueDateTo, "结束交期");
  const orders = await listOrders(user.workspaceId, {
    customerName,
    query,
    statuses,
    dueDateFrom: dueDateFrom?.start,
    dueDateTo: dueDateTo?.end,
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
            订单
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            跟踪计划数量、生产出货进度和结单状态。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-500">共 {orders.length} 单</p>
          {canManageOrders ? (
            <CreateEntityDialog buttonLabel="新增订单" title="新增订单">
              <form action={createOrderAction} className="grid gap-4">
                <TextInput
                  label="客户名称"
                  id="createCustomerName"
                  name="customerName"
                  required
                />
                <TextInput
                  label="工件名称"
                  id="createPartName"
                  name="partName"
                  required
                />
                <NumberInput
                  label="计划数量"
                  id="createPlannedQuantity"
                  name="plannedQuantity"
                  min={1}
                  step={1}
                />
                <NumberInput
                  label="单价（元/件）"
                  id="createUnitPrice"
                  name="unitPrice"
                  min={0}
                  step={0.01}
                />
                <DateInput label="交期" id="createDueDate" name="dueDate" />
                <Textarea label="备注" id="createOrderNotes" name="notes" />
                <SubmitButton>创建订单</SubmitButton>
              </form>
            </CreateEntityDialog>
          ) : null}
        </div>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <form
          className="grid gap-3 lg:grid-cols-[1fr_1fr_160px_150px_150px_auto]"
          action="/orders"
        >
          <TextInput
            label="客户"
            name="customerName"
            placeholder="客户名称"
            defaultValue={customerName}
          />
          <TextInput
            label="搜索"
            name="query"
            placeholder="订单号或工件"
            defaultValue={query}
          />
          <MultiSelectInput
            label="状态"
            name="status"
            selectedValues={statuses ?? []}
            options={statusOptions}
          />
          <DateInput
            label="交期从"
            name="dueDateFrom"
            defaultValue={params.dueDateFrom ?? ""}
          />
          <DateInput
            label="交期至"
            name="dueDateTo"
            defaultValue={params.dueDateTo ?? ""}
          />
          <div className="flex items-end">
            <SubmitButton className="w-full lg:w-auto">筛选</SubmitButton>
          </div>
        </form>
      </section>

      <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
        {orders.length === 0 ? (
          <div className="p-8 text-center">
            <h2 className="text-base font-semibold text-slate-950">
              暂无订单
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              创建订单后，这里会显示计划、出货和结单进度。
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">订单</th>
                  <th className="whitespace-nowrap px-4 py-3">状态</th>
                  {canManageOrders ? (
                    <>
                      <th className="px-4 py-3 text-right">单价</th>
                      <th className="px-4 py-3 text-right">金额</th>
                    </>
                  ) : null}
                  <th className="whitespace-nowrap px-4 py-3 text-right">
                    计划
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">
                    加工
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">
                    出货
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">
                    剩余
                  </th>
                  <th className="whitespace-nowrap px-4 py-3">提示</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {orders.map((order) => (
                  <tr key={order.id} className="align-top">
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-950">
                        {formatOrderTitle(order)}
                      </div>
                      <div className="mt-1 text-slate-600">
                        {order.customerName}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        交期{" "}
                        {order.dueDate
                          ? formatBusinessDate(order.dueDate)
                          : "未填写"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <StatusBadge
                        status={order.status}
                        labels={orderStatusLabels}
                      />
                    </td>
                    {canManageOrders ? (
                      <>
                        <td className="px-4 py-4 text-right font-medium text-slate-950">
                          {formatCnyFromCents(order.unitPriceCents)}
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-slate-950">
                          {formatCnyFromCents(
                            getOrderAmountCents(
                              order.unitPriceCents,
                              order.plannedQuantity,
                            ),
                          )}
                        </td>
                      </>
                    ) : null}
                    <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-slate-950">
                      {formatQuantity(order.plannedQuantity)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-slate-950">
                      {order.completedQuantity}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-slate-950">
                      {order.shippedQuantity}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-medium text-slate-950">
                      {formatQuantity(order.remainingQuantity)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {order.isOverPlanned ? (
                          <span className="text-xs font-medium text-amber-700">
                            超出计划
                          </span>
                        ) : null}
                        {order.canClose ? (
                          <span className="text-xs font-medium text-emerald-700">
                            出货达到计划
                          </span>
                        ) : null}
                        {!order.isOverPlanned && !order.canClose ? (
                          <span className="text-slate-400">-</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <Link
                        href={`/orders/${order.id}`}
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
      </section>
    </div>
  );
}
