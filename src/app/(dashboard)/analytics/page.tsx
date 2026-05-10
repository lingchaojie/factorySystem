import React from "react";
import { DateInput, SubmitButton } from "@/components/forms";
import { orderStatusLabels } from "@/components/status-badge";
import { formatCnyFromCents } from "@/domain/money";
import {
  businessDateRange,
  businessTodayBounds,
} from "@/lib/business-time";
import { requireManager } from "@/lib/auth";
import { getWorkspaceAnalytics } from "@/server/services/analytics";

function parseFrom(value: string | undefined) {
  if (!value) {
    const today = businessTodayBounds();
    return new Date(today.start.getTime() - 29 * 24 * 60 * 60 * 1000);
  }
  const range = businessDateRange(value);
  if (Number.isNaN(range.start.getTime())) throw new Error("开始日期无效");
  return range.start;
}

function parseTo(value: string | undefined) {
  if (!value) return businessTodayBounds().end;
  const range = businessDateRange(value);
  if (Number.isNaN(range.end.getTime())) throw new Error("结束日期无效");
  return range.end;
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold text-slate-950">{value}</dd>
      {hint ? <p className="mt-2 text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireManager();
  const params = await searchParams;
  const from = parseFrom(params.from);
  const to = parseTo(params.to);
  const analytics = await getWorkspaceAnalytics(user.workspaceId, { from, to });
  const topCustomers = analytics.customerRevenue.slice(0, 5);
  const topCustomerTotal = topCustomers.reduce(
    (total, row) => total + row.revenueCents,
    0,
  );
  let pieCursor = 0;
  const pieStops =
    topCustomerTotal > 0
      ? topCustomers
          .map((row, index) => {
            const colors = ["#0f766e", "#2563eb", "#b45309", "#7c3aed", "#475569"];
            const start = pieCursor;
            pieCursor += percent(row.revenueCents, topCustomerTotal);
            return `${colors[index]} ${start}% ${pieCursor}%`;
          })
          .join(", ")
      : "#e2e8f0 0% 100%";
  const maxDailyRevenue = Math.max(
    1,
    ...analytics.dailySeries.map((row) => row.revenueCents),
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
            经营
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            按出货数量和订单单价统计营业额，辅助判断产出和客户结构。
          </p>
        </div>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <form
          className="grid gap-3 sm:grid-cols-[160px_160px_auto]"
          action="/analytics"
        >
          <DateInput label="开始日期" name="from" defaultValue={params.from ?? ""} />
          <DateInput label="结束日期" name="to" defaultValue={params.to ?? ""} />
          <div className="flex items-end">
            <SubmitButton className="w-full sm:w-auto">筛选</SubmitButton>
          </div>
        </form>
      </section>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="营业额" value={formatCnyFromCents(analytics.revenueCents)} />
        <MetricCard label="加工量" value={analytics.completedQuantity} />
        <MetricCard label="出货量" value={analytics.shippedQuantity} />
        <MetricCard
          label="未定价出货"
          value={`${analytics.unpricedShippedQuantity}`}
          hint={`未定价出货 ${analytics.unpricedShippedQuantity} 件`}
        />
      </dl>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">
            客户营业额占比
          </h2>
          <div
            className="mx-auto mt-5 h-48 w-48 rounded-full border border-slate-200"
            style={{ background: `conic-gradient(${pieStops})` }}
            aria-hidden="true"
          />
          <div className="mt-5 space-y-3">
            {topCustomers.length === 0 ? (
              <p className="text-sm text-slate-500">当前范围没有已定价出货。</p>
            ) : (
              topCustomers.map((row) => (
                <div
                  key={row.customerName}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="font-medium text-slate-950">
                    {row.customerName}
                  </span>
                  <span className="text-slate-600">
                    {formatCnyFromCents(row.revenueCents)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">每日趋势</h2>
          {analytics.dailySeries.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">当前范围暂无记录。</p>
          ) : (
            <div className="mt-4 space-y-3">
              {analytics.dailySeries.map((row) => (
                <div key={row.date} className="grid gap-2 sm:grid-cols-[110px_1fr]">
                  <div className="text-sm font-medium text-slate-700">
                    {row.date}
                  </div>
                  <div>
                    <div className="h-3 overflow-hidden rounded bg-slate-100">
                      <div
                        className="h-full rounded bg-teal-700"
                        style={{
                          width: `${Math.max(
                            4,
                            percent(row.revenueCents, maxDailyRevenue),
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatCnyFromCents(row.revenueCents)}，加工{" "}
                      {row.completedQuantity}，出货 {row.shippedQuantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">
            订单状态分布
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {analytics.orderStatusDistribution.map((row) => (
              <div
                key={row.status}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                <span className="text-slate-600">
                  {orderStatusLabels[row.status]}
                </span>
                <span className="font-semibold text-slate-950">{row.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">经营提示</h2>
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            {analytics.unpricedShippedQuantity > 0 ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                有 {analytics.unpricedShippedQuantity} 件出货没有单价，营业额未完整统计。
              </p>
            ) : null}
            {analytics.overPlannedOrders.length > 0 ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                有 {analytics.overPlannedOrders.length} 个订单超过计划数量。
              </p>
            ) : null}
            {analytics.unpricedShippedQuantity === 0 &&
            analytics.overPlannedOrders.length === 0 ? (
              <p>当前范围没有明显异常。</p>
            ) : null}
          </div>
        </section>
      </section>
    </div>
  );
}
