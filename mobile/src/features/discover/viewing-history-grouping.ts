import type { RecommendationHistoryItem } from "@/types/domain";

export type HistorySection = {
  title: string;
  data: RecommendationHistoryItem[];
};

function dateParts(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((parts, part) => {
      parts[part.type] = part.value;
      return parts;
    }, {});
}

export function historyDayKey(date: Date, timeZone: string) {
  const parts = dateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function historyDayLabel(date: Date, timeZone: string) {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const key = historyDayKey(date, timeZone);
  if (key === historyDayKey(today, timeZone)) return "Today";
  if (key === historyDayKey(yesterday, timeZone)) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(date);
}

export function groupViewingHistory(
  items: RecommendationHistoryItem[],
  timeZone: string,
): HistorySection[] {
  const sections = new Map<string, HistorySection>();
  for (const item of items) {
    const date = new Date(item.viewedAt);
    const key = historyDayKey(date, timeZone);
    const section = sections.get(key) ?? {
      title: historyDayLabel(date, timeZone),
      data: [],
    };
    section.data.push(item);
    sections.set(key, section);
  }
  return [...sections.values()];
}
