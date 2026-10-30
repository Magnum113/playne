import type { PoolClient } from "pg";
export const DEFAULT_REMINDERS = {
  enabled: true,
  days: [1, 3, 5],
  time: "19:00",
  timezone: "Europe/Moscow",
} as const;
export function reminderClock(now: number) {
  const date = new Date(now + 3 * 3600000);
  return {
    day: date.toISOString().slice(0, 10),
    weekday: date.getUTCDay() || 7,
    minutes: date.getUTCHours() * 60 + date.getUTCMinutes(),
  };
}
export function validReminderSchedule(
  value: any,
): value is { enabled: boolean; days: number[]; time: string } {
  if (
    typeof value?.enabled !== "boolean" ||
    !Array.isArray(value.days) ||
    value.days.length < 1 ||
    value.days.length > 7 ||
    new Set(value.days).size !== value.days.length ||
    !value.days.every(
      (day: unknown) =>
        Number.isInteger(day) && Number(day) >= 1 && Number(day) <= 7,
    ) ||
    !/^(?:1[0-9]|20):[0-5][0-9]$/.test(value.time ?? "")
  )
    return false;
  return true;
}
export function reminderDue(contact: any, now: number) {
  const clock = reminderClock(now);
  const [hours, minutes] = String(contact.reminder_time).split(":").map(Number);
  return (
    contact.purpose === "general" &&
    contact.reminders_enabled &&
    (contact.reminder_days ?? []).includes(clock.weekday) &&
    Number.isFinite(hours) &&
    Number.isFinite(minutes) &&
    clock.minutes >= hours * 60 + minutes &&
    clock.minutes >= 600 &&
    clock.minutes < 1260
  );
}
export async function playedToday(
  c: Pick<PoolClient, "query">,
  userId: string,
  now: number,
) {
  const day = reminderClock(now).day;
  return !!(
    await c.query(
      "SELECT 1 FROM playne_games WHERE owner_id=$1 AND completed_at>=($2::date AT TIME ZONE 'Europe/Moscow') AND completed_at<(($2::date+1) AT TIME ZONE 'Europe/Moscow') LIMIT 1",
      [userId, day],
    )
  ).rowCount;
}
