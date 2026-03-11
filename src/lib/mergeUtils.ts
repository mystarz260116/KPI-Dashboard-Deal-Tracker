export function normalize(value: string): string {
  return Array.from(value ?? '')
    .map((char) => {
      const code = char.charCodeAt(0);

      // Full-width ASCII variants (numbers, alphabet, symbols) -> half-width
      if (code >= 0xff01 && code <= 0xff5e) {
        return String.fromCharCode(code - 0xfee0);
      }

      // Full-width space -> half-width space
      if (code === 0x3000) {
        return ' ';
      }

      return char;
    })
    .join('')
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[()（）]/g, '')
    .trim();
}

export function toBigramSet(value: string): Set<string> {
  const normalized = normalize(value);
  const grams = new Set<string>();

  if (normalized.length < 2) {
    if (normalized) grams.add(normalized);
    return grams;
  }

  for (let i = 0; i < normalized.length - 1; i += 1) {
    grams.add(normalized.slice(i, i + 2));
  }

  return grams;
}

export function similarity(left: string, right: string): number {
  const leftSet = toBigramSet(left);
  const rightSet = toBigramSet(right);

  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let intersection = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  });

  return intersection / Math.max(leftSet.size, rightSet.size);
}
