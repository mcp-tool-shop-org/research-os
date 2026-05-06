import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseUrlsFileText,
  readUrlsFile,
  dedupeAndValidate,
  collectUrls,
} from '../src/sources/url-input.js';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-urls-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('parseUrlsFileText', () => {
  it('strips blank lines and # comments', () => {
    const text = `# header comment
https://example.com/a

# section break
https://example.com/b
   https://example.com/c
`;
    expect(parseUrlsFileText(text)).toEqual([
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/c',
    ]);
  });

  it('returns empty for entirely commented file', () => {
    expect(parseUrlsFileText('# only\n# comments\n')).toEqual([]);
  });
});

describe('readUrlsFile', () => {
  it('reads URLs from disk and applies the same parsing rules', async () => {
    const path = join(workDir, 'urls.txt');
    await writeFile(path, '# header\nhttps://example.com/a\nhttps://example.com/b\n', 'utf8');
    expect(await readUrlsFile(path)).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });
});

describe('dedupeAndValidate', () => {
  it('dedupes exact duplicates and rejects non-http(s)', () => {
    const { valid, invalid } = dedupeAndValidate([
      'https://example.com/a',
      'https://example.com/a',
      'http://example.com/b',
      'ftp://example.com/c',
      'not a url',
    ]);
    expect(valid).toEqual(['https://example.com/a', 'http://example.com/b']);
    expect(invalid).toEqual(['ftp://example.com/c', 'not a url']);
  });
});

describe('collectUrls', () => {
  it('combines --url and --urls-file inputs and dedupes across both', async () => {
    const path = join(workDir, 'urls.txt');
    await writeFile(path, 'https://example.com/a\nhttps://example.com/c\n', 'utf8');
    const { urls, invalid } = await collectUrls({
      urls: ['https://example.com/a', 'https://example.com/b'],
      urlsFile: path,
    });
    expect(urls).toEqual([
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/c',
    ]);
    expect(invalid).toEqual([]);
  });
});
