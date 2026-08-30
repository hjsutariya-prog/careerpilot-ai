const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type FirstSearchSetup = {
  hasResume: boolean;
  hasPreferences: boolean;
  hasPreviousSearch: boolean;
};

export function planFirstSearch(setup: FirstSearchSetup) {
  if (!setup.hasResume || !setup.hasPreferences || setup.hasPreviousSearch) return null;
  return { kind: "first" as const, delayMs: 0 };
}

export function nextRunAtForIst(dailyTime: string, now: number) {
  const match = /^(\d{2}):(\d{2})$/.exec(dailyTime);
  if (!match) throw new Error("Daily search time must use HH:mm format.");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("Daily search time is not valid.");

  const nowInIst = new Date(now + IST_OFFSET_MS);
  const candidate = Date.UTC(
    nowInIst.getUTCFullYear(),
    nowInIst.getUTCMonth(),
    nowInIst.getUTCDate(),
    hour,
    minute,
  ) - IST_OFFSET_MS;

  return candidate > now ? candidate : candidate + 24 * 60 * 60 * 1000;
}
