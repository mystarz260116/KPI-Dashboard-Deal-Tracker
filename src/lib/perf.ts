const isBrowser = typeof window !== 'undefined';
const enabled = isBrowser;

export function perfMark(name: string) {
  if (!enabled) return;
  performance.mark(name);
}

export function perfMeasure(name: string, startMark: string, endMark: string) {
  if (!enabled) return null;

  try {
    performance.measure(name, startMark, endMark);
    const entries = performance.getEntriesByName(name, 'measure');
    const entry = entries[entries.length - 1];

    if (entry) {
      console.info(`[perf] ${name}: ${entry.duration.toFixed(1)}ms`);
      return entry.duration;
    }
  } catch {
    return null;
  } finally {
    performance.clearMeasures(name);
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
  }

  return null;
}

export function perfNow() {
  if (!enabled) return 0;
  return performance.now();
}

export function isPerfEnabled() {
  return enabled;
}
