import React from "react";

export const machineStatusLabels = {
  active: "正常",
  idle: "空闲",
  maintenance: "维护中",
  disabled: "停用",
} as const;

export const orderStatusLabels = {
  open: "进行中",
  closed: "已结单",
} as const;

type Status = keyof typeof machineStatusLabels | keyof typeof orderStatusLabels;

type StatusBadgeProps<TStatus extends string> = {
  status: TStatus;
  labels: Record<TStatus, string>;
  className?: string;
};

const statusClassNames: Record<Status, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  idle: "border-slate-200 bg-slate-100 text-slate-700",
  maintenance: "border-amber-200 bg-amber-50 text-amber-800",
  disabled: "border-rose-200 bg-rose-50 text-rose-700",
  open: "border-sky-200 bg-sky-50 text-sky-700",
  closed: "border-slate-200 bg-white text-slate-600",
};

export function StatusBadge<TStatus extends Status>({
  status,
  labels,
  className,
}: StatusBadgeProps<TStatus>) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        statusClassNames[status],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {labels[status]}
    </span>
  );
}
