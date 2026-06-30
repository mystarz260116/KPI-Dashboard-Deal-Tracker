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

const LEGAL_ENTITY_PREFIXES = [
  '医療法人社団法人',
  '医療法人財団',
  '医療法人社団',
  '医療法人',
  '一般社団法人',
  '公益社団法人',
  '一般財団法人',
  '公益財団法人',
  '社会福祉法人',
  '学校法人',
  '株式会社',
  '有限会社',
  '合同会社',
  '合資会社',
  '合名会社',
];

export function normalizeClinicNameForMerge(value: string): string {
  let normalized = normalize(
    String(value ?? '').trim().replace(/^[^）)]{1,20}[）)]/, '')
  );
  let changed = true;

  while (changed) {
    changed = false;
    for (const prefix of LEGAL_ENTITY_PREFIXES) {
      const normalizedPrefix = normalize(prefix);
      if (normalized.startsWith(normalizedPrefix)) {
        normalized = normalized.slice(normalizedPrefix.length);
        changed = true;
      }
    }
  }

  return normalized;
}

function toBigramSetFromNormalized(value: string): Set<string> {
  const grams = new Set<string>();

  if (value.length < 2) {
    if (value) grams.add(value);
    return grams;
  }

  for (let i = 0; i < value.length - 1; i += 1) {
    grams.add(value.slice(i, i + 2));
  }

  return grams;
}

export function clinicNameSimilarity(left: string, right: string): number {
  const leftSet = toBigramSetFromNormalized(normalizeClinicNameForMerge(left));
  const rightSet = toBigramSetFromNormalized(normalizeClinicNameForMerge(right));

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

export function evaluateMergeMatch(left: string, right: string): {
  score: number;
  reason: 'name_similarity' | 'clinic_name_normalized_similarity';
} | null {
  const rawScore = similarity(left, right);
  if (rawScore >= 0.95) {
    return {
      score: rawScore,
      reason: 'name_similarity',
    };
  }

  const normalizedScore = clinicNameSimilarity(left, right);
  if (normalizedScore >= 0.95) {
    return {
      score: normalizedScore,
      reason: 'clinic_name_normalized_similarity',
    };
  }

  return null;
}
