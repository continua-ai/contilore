import { normalizeText } from "./signatures.js";

function tokenSet(text: string): Set<string> {
  const normalized = normalizeText(text);
  if (!normalized) {
    return new Set<string>();
  }
  return new Set(normalized.split(" ").filter((token) => token.length > 2));
}

export function jaccardSimilarity(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);

  if (left.size === 0 && right.size === 0) {
    return 1;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  if (union === 0) {
    return 0;
  }

  return intersection / union;
}

export function areNearDuplicate(a: string, b: string, threshold = 0.85): boolean {
  return jaccardSimilarity(a, b) >= threshold;
}
