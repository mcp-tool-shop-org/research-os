import { readFile } from 'node:fs/promises';

export function parseUrlsFileText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export async function readUrlsFile(path: string): Promise<string[]> {
  const text = await readFile(path, 'utf8');
  return parseUrlsFileText(text);
}

function isValidHttpUrl(candidate: string): boolean {
  try {
    const u = new URL(candidate);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * A-009 — canonicalize a URL before dedup. Lowercases hostname, strips default
 * ports, drops the fragment. Returns null when the URL cannot be parsed or
 * uses a non-http(s) protocol.
 */
function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hostname = u.hostname.toLowerCase();
    if (
      (u.protocol === 'http:' && u.port === '80') ||
      (u.protocol === 'https:' && u.port === '443')
    ) {
      u.port = '';
    }
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

export function dedupeAndValidate(urls: string[]): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const u of urls) {
    if (!isValidHttpUrl(u)) {
      invalid.push(u);
      continue;
    }
    const norm = canonicalizeUrl(u);
    if (norm === null) {
      invalid.push(u);
      continue;
    }
    if (seen.has(norm)) continue;
    seen.add(norm);
    valid.push(norm);
  }
  return { valid, invalid };
}

export async function collectUrls(input: {
  urls?: string[];
  urlsFile?: string;
}): Promise<{ urls: string[]; invalid: string[] }> {
  const collected: string[] = [];
  if (input.urls) collected.push(...input.urls);
  if (input.urlsFile) collected.push(...(await readUrlsFile(input.urlsFile)));
  const { valid, invalid } = dedupeAndValidate(collected);
  return { urls: valid, invalid };
}
