

export type Period = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toYearMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getYearMonthsBetween(start: Date, end: Date): string[] {
  const months: string[] = [];

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endMonth) {
    months.push(toYearMonth(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

export function expandYearMonthFormats(yearMonths: string[]) {
  const variants = new Set<string>();

  yearMonths.forEach((value) => {
    const normalized = String(value).trim();
    if (!normalized) return;

    variants.add(normalized);

    const [year, monthRaw] = normalized.split('-');
    const monthNumber = Number.parseInt(monthRaw ?? '', 10);

    if (year && Number.isFinite(monthNumber)) {
      const paddedMonth = String(monthNumber).padStart(2, '0');
      const shortMonth = new Date(Number(year), monthNumber - 1, 1).toLocaleString('en-US', { month: 'short' });
      const shortYear = year.slice(-2);
      variants.add(`${year}/${monthNumber}`);
      variants.add(`${year}/${paddedMonth}`);
      variants.add(`${year}-${monthNumber}`);
      variants.add(`${year}-${paddedMonth}`);
      variants.add(`${shortMonth}-${shortYear}`);
      variants.add(`${shortMonth}-${year}`);
    }
  });

  return Array.from(variants);
}

export function getPeriodRange(period: Period) {
  const now = new Date();

  let start: Date;
  let end: Date;

  if (period === 'weekly') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    start = new Date(now.setDate(diff));
    start.setHours(0, 0, 0, 0);

    end = new Date(start);
    end.setDate(start.getDate() + 7);
  } else if (period === 'monthly') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (period === 'quarterly') {
    const quarter = Math.floor(now.getMonth() / 3);
    start = new Date(now.getFullYear(), quarter * 3, 1);
    end = new Date(now.getFullYear(), quarter * 3 + 3, 1);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear() + 1, 0, 1);
  }

  return { start, end };
}
