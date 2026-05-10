const cnyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
});

export function parseOptionalYuanToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("-")) {
    throw new Error("单价不能小于 0");
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("单价最多保留两位小数");
  }

  const [yuan, cents = ""] = trimmed.split(".");
  const result = Number(yuan) * 100 + Number(cents.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) {
    throw new Error("单价过大");
  }
  return result;
}

export function formatCnyFromCents(cents: number | null | undefined): string {
  if (cents == null) return "-";
  return cnyFormatter.format(cents / 100);
}

export function getOrderAmountCents(
  unitPriceCents: number | null | undefined,
  plannedQuantity: number,
): number | null {
  if (unitPriceCents == null) return null;
  return unitPriceCents * plannedQuantity;
}
