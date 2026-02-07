const ERROR_LINE_PATTERN =
  /(error|exception|failed|fatal|traceback|permission denied|not found)/i;

const FILE_PATH_PATTERN =
  /(?:\.?\.\/)?[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|json|md|py|go|java|sql|proto)/g;

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/g, "<hex>")
    .replace(/\b\d+\b/g, "<num>")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCommandSignature(command: string): string {
  const collapsed = normalizeText(command);
  return collapsed.replace(/\s+/g, " ").slice(0, 240);
}

export function extractErrorSignatures(text: string, maxSignatures = 8): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (!ERROR_LINE_PATTERN.test(line)) {
      continue;
    }
    const signature = normalizeText(line).slice(0, 240);
    if (!signature || seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    output.push(signature);
    if (output.length >= maxSignatures) {
      break;
    }
  }

  return output;
}

export function extractLikelyFilePaths(text: string, maxPaths = 12): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(FILE_PATH_PATTERN)) {
    const path = match[0];
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    output.push(path);
    if (output.length >= maxPaths) {
      break;
    }
  }

  return output;
}

export function looksLikeErrorText(text: string): boolean {
  return ERROR_LINE_PATTERN.test(text);
}
