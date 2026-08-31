export const RESTAURANT_TIME_ZONE = "America/Campo_Grande";

export type RestaurantHoursSource = {
  is_open_override: "auto" | "open" | "closed";
};

export type BusinessHourSource = {
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
};

const WEEKDAY_BY_SHORT_NAME: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function parseTimeToSeconds(value: string | null): number | null {
  if (!value) return null;
  const [hour, minute, second = "0"] = value.split(":");
  const h = Number(hour);
  const m = Number(minute);
  const s = Number(second);
  if (![h, m, s].every(Number.isFinite)) return null;
  return h * 3600 + m * 60 + s;
}

function getLocalWeekdayAndTime(now: Date): { weekday: number; seconds: number } | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESTAURANT_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = WEEKDAY_BY_SHORT_NAME[values.weekday];
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);

  if (weekday === undefined || ![hour, minute, second].every(Number.isFinite)) return null;
  return { weekday, seconds: hour * 3600 + minute * 60 + second };
}

function isUsableHour(hour: BusinessHourSource | undefined): hour is BusinessHourSource {
  return Boolean(hour && !hour.is_closed && hour.opens_at && hour.closes_at);
}

/**
 * Protecao secundaria no navegador. O banco continua sendo a autoridade final.
 * Domingo e sempre fechado para a Plano B, inclusive se um override antigo
 * ficar preso em "open".
 */
export function isRestaurantOpenForSchedule(
  restaurant: RestaurantHoursSource | null | undefined,
  hours: BusinessHourSource[],
  now = new Date(),
): boolean {
  if (!restaurant) return false;

  const local = getLocalWeekdayAndTime(now);
  if (!local) return false;

  // Regra operacional fixa da Plano B: domingo nao recebe pedidos.
  if (local.weekday === 0) return false;

  if (restaurant.is_open_override === "closed") return false;
  if (restaurant.is_open_override === "open") return true;

  const today = hours.find((hour) => hour.weekday === local.weekday);
  if (isUsableHour(today)) {
    const opens = parseTimeToSeconds(today.opens_at);
    const closes = parseTimeToSeconds(today.closes_at);
    if (opens !== null && closes !== null) {
      if (closes > opens && local.seconds >= opens && local.seconds <= closes) return true;
      if (closes <= opens && local.seconds >= opens) return true;
    }
  }

  // Se o expediente anterior cruza a meia-noite, ainda pode estar aberto hoje.
  const previousWeekday = (local.weekday + 6) % 7;
  const previous = hours.find((hour) => hour.weekday === previousWeekday);
  if (!isUsableHour(previous)) return false;

  const previousOpens = parseTimeToSeconds(previous.opens_at);
  const previousCloses = parseTimeToSeconds(previous.closes_at);
  return (
    previousOpens !== null &&
    previousCloses !== null &&
    previousCloses <= previousOpens &&
    local.seconds <= previousCloses
  );
}
