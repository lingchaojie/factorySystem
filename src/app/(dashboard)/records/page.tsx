import { OrderStatus } from "@prisma/client";
import Link from "next/link";
import {
  deleteRecordAction,
  updateRecordAction,
} from "@/app/actions/records";
import {
  DateInput,
  NumberInput,
  SelectInput,
  SubmitButton,
  Textarea,
  TextInput,
} from "@/components/forms";
import { orderStatusLabels, StatusBadge } from "@/components/status-badge";
import {
  businessDateRange,
  formatBusinessDateTime,
  formatDateTimeLocalValue,
} from "@/lib/business-time";
import { requireWorkspaceId } from "@/lib/workspace";
import { listMachines } from "@/server/services/machines";
import { listOrders } from "@/server/services/orders";
import { listProductionRecords } from "@/server/services/records";
import { DeleteRecordButton } from "./delete-record-button";

const statusOptions: Array<{ value: OrderStatus | ""; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "open", label: orderStatusLabels.open },
  { value: "closed", label: orderStatusLabels.closed },
];

function parseOrderStatus(value: string | undefined): OrderStatus | undefined {
  if (!value) return undefined;
  return value in orderStatusLabels ? (value as OrderStatus) : undefined;
}

function parseDateRange(value: string | undefined, label: string) {
  if (!value) return undefined;
  const range = businessDateRange(value);
  if (Number.isNaN(range.start.getTime())) {
    throw new Error(`${label}无效`);
  }
  return range;
}

function formatOrder(order: { orderNo: string | null; partName: string }) {
  return order.orderNo ? `${order.orderNo} / ${order.partName}` : order.partName;
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    machineId?: string;
    orderId?: string;
    customerName?: string;
    status?: string;
  }>;
}) {
  const workspaceId = await requireWorkspaceId();
  const params = await searchParams;
  const fromRange = parseDateRange(params.from, "开始日期");
  const toRange = parseDateRange(params.to, "结束日期");
  const machineId = params.machineId?.trim() || undefined;
  const orderId = params.orderId?.trim() || undefined;
  const customerName = params.customerName?.trim() ?? "";
  const orderStatus = parseOrderStatus(params.status);

  const [records, machines, orders] = await Promise.all([
    listProductionRecords(workspaceId, {
      machineId,
      orderId,
      customerName,
      orderStatus,
      from: fromRange?.start,
      to: toRange?.end,
    }),
    listMachines(workspaceId, {}),
    listOrders(workspaceId, {}),
  ]);

  const machineOptions = [
    { value: "", label: "全部机器" },
    ...machines.map((machine) => ({
      value: machine.id,
      label: `${machine.code} / ${machine.name}`,
    })),
  ];
  const orderOptions = [
    { value: "", label: "全部订单" },
    ...orders.map((order) => ({
      value: order.id,
      label: formatOrder(order),
    })),
  ];

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
          className="grid gap-3 lg:grid-cols-[140px_140px_180px_220px_1fr_150px_auto]"
          action="/records"
        >
          <DateInput
            label="日期从"
            name="from"
            defaultValue={params.from ?? ""}
          />
          <DateInput label="日期至" name="to" defaultValue={params.to ?? ""} />
          <SelectInput
            label="机器"
            name="machineId"
            defaultValue={machineId ?? ""}
            options={machineOptions}
          />
          <SelectInput
            label="订单"
            name="orderId"
            defaultValue={orderId ?? ""}
            options={orderOptions}
          />
          <TextInput
            label="客户"
            name="customerName"
            placeholder="客户名称"
            defaultValue={customerName}
          />
          <SelectInput
            label="订单状态"
            name="status"
            defaultValue={orderStatus ?? ""}
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
            const isClosed = record.order.status === "closed";
            return (
              <article
                key={record.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-950">
                        {formatBusinessDateTime(record.recordedAt)}
                      </h2>
                      <StatusBadge
                        status={record.order.status}
                        labels={orderStatusLabels}
                      />
                    </div>
                    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="text-slate-500">机器</dt>
                        <dd className="mt-1 font-medium text-slate-950">
                          <Link
                            href={`/machines/${record.machineId}`}
                            className="hover:text-slate-600"
                          >
                            {record.machine.code} / {record.machine.name}
                          </Link>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">客户</dt>
                        <dd className="mt-1 font-medium text-slate-950">
                          {record.order.customerName}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">订单</dt>
                        <dd className="mt-1 font-medium text-slate-950">
                          <Link
                            href={`/orders/${record.orderId}`}
                            className="hover:text-slate-600"
                          >
                            {formatOrder(record.order)}
                          </Link>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">数量</dt>
                        <dd className="mt-1 font-medium text-slate-950">
                          加工 {record.completedQuantity} / 出货{" "}
                          {record.shippedQuantity}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                      {record.notes || "无备注"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  {isClosed ? (
                    <p className="mb-3 text-sm text-slate-500">
                      所属订单已结单，不能修改或删除记录。
                    </p>
                  ) : null}
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                    <form
                      action={updateRecordAction}
                      className="grid gap-3 md:grid-cols-[180px_130px_130px_minmax(220px,1fr)_auto]"
                    >
                      <input type="hidden" name="recordId" value={record.id} />
                      <TextInput
                        label="记录时间"
                        name="recordedAt"
                        type="datetime-local"
                        defaultValue={formatDateTimeLocalValue(record.recordedAt)}
                        disabled={isClosed}
                      />
                      <NumberInput
                        label="加工数量"
                        name="completedQuantity"
                        min={0}
                        step={1}
                        defaultValue={record.completedQuantity}
                        disabled={isClosed}
                      />
                      <NumberInput
                        label="出货数量"
                        name="shippedQuantity"
                        min={0}
                        step={1}
                        defaultValue={record.shippedQuantity}
                        disabled={isClosed}
                      />
                      <Textarea
                        label="备注"
                        name="notes"
                        defaultValue={record.notes ?? ""}
                        className="min-h-10"
                        disabled={isClosed}
                      />
                      <div className="flex items-end">
                        <SubmitButton disabled={isClosed}>保存</SubmitButton>
                      </div>
                    </form>
                    <form action={deleteRecordAction}>
                      <input type="hidden" name="recordId" value={record.id} />
                      <DeleteRecordButton disabled={isClosed} />
                    </form>
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
