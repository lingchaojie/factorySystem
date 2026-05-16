import React from "react";

type ProgressRecord = {
  type: string;
  quantity: number;
};

type OrderProgressBarsProps = {
  plannedQuantity: number | null;
  completedQuantity: number;
  shippedQuantity: number;
  className?: string;
};

function clampPercent(value: number, plannedQuantity: number) {
  return Math.min(Math.max(Math.round((value / plannedQuantity) * 100), 0), 100);
}

function ProgressRow({
  label,
  value,
  plannedQuantity,
  tone,
}: {
  label: string;
  value: number;
  plannedQuantity: number | null;
  tone: "green" | "blue";
}) {
  const hasPlan = plannedQuantity !== null && plannedQuantity > 0;
  const percent = hasPlan ? clampPercent(value, plannedQuantity) : 0;
  const plannedText = hasPlan ? plannedQuantity : "-";
  const barColor = tone === "green" ? "bg-emerald-500" : "bg-sky-500";
  const textColor = tone === "green" ? "text-emerald-700" : "text-sky-700";

  return (
    <div className="grid gap-0.5">
      <div
        aria-label={`${label}进度`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
      >
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={`whitespace-nowrap text-[11px] leading-4 ${textColor}`}>
        {label} {value} / {plannedText}
      </span>
    </div>
  );
}

export function summarizeProgressRecords(records?: readonly ProgressRecord[]) {
  return (records ?? []).reduce(
    (summary, record) => {
      if (record.type === "completed") {
        summary.completedQuantity += record.quantity;
      }
      if (record.type === "shipped") {
        summary.shippedQuantity += record.quantity;
      }
      return summary;
    },
    { completedQuantity: 0, shippedQuantity: 0 },
  );
}

export function OrderProgressBars({
  plannedQuantity,
  completedQuantity,
  shippedQuantity,
  className = "",
}: OrderProgressBarsProps) {
  const completed = Math.max(completedQuantity, 0);
  const shipped = Math.max(shippedQuantity, 0);

  return (
    <div
      className={`grid w-32 shrink-0 gap-1.5 whitespace-normal ${className}`}
    >
      <ProgressRow
        label="出货量"
        value={shipped}
        plannedQuantity={plannedQuantity}
        tone="green"
      />
      <ProgressRow
        label="加工量"
        value={completed}
        plannedQuantity={plannedQuantity}
        tone="blue"
      />
    </div>
  );
}
