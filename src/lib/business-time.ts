export const BUSINESS_TIME_ZONE = "Asia/Shanghai";

const shanghaiOffsetMinutes = 8 * 60;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getBusinessDateTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) === 24 ? 0 : Number(values.hour),
    minute: Number(values.minute),
  };
}

export function formatDateTimeLocalValue(date = new Date()) {
  const parts = getBusinessDateTimeParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(
    parts.hour,
  )}:${pad(parts.minute)}`;
}

export function parseBusinessDateTimeLocal(value: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );

  if (!match) {
    return new Date(Number.NaN);
  }

  const [, year, month, day, hour, minute, second = "0"] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute) - shanghaiOffsetMinutes,
      Number(second),
    ),
  );

  const parts = getBusinessDateTimeParts(date);
  if (
    parts.year !== Number(year) ||
    parts.month !== Number(month) ||
    parts.day !== Number(day) ||
    parts.hour !== Number(hour) ||
    parts.minute !== Number(minute)
  ) {
    return new Date(Number.NaN);
  }

  return date;
}

export function businessTodayBounds(date = new Date()) {
  const parts = getBusinessDateTimeParts(date);
  const start = parseBusinessDateTimeLocal(
    `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T00:00`,
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
}

export function formatBusinessDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: BUSINESS_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
