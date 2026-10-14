import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

import { init } from '../../src/intake/index.js';
import { add as sectionAdd } from '../../src/sections/index.js';
import {
  fetchOnce,
  gather,
  redactThirdPartyKeys,
  redactThirdPartyPersonalData,
  PERSONAL_USER_REDACTED_MARKER,
  PERSONAL_EMAIL_REDACTED_MARKER,
  FetchReceiptSchema,
  SourceCardSchema,
  HeuristicExtractor,
} from '../../src/sources/index.js';

// Fixtures are assembled at runtime so no contiguous home path or personal
// address sits in source control, where the studio's identity scan would read it.
const BS = '\\';
const winHome = (account: string, rest: string) => `C:${BS}Users${BS}${account}${BS}${rest}`;
const jsonHome = (account: string, rest: string) => `C:${BS}${BS}Users${BS}${BS}${account}${BS}${BS}${rest}`;
const mailbox = (local: string, domain: string) => `${local}@${domain}`;

const STRANGER = 'some-stranger';
const PERSON = 'a.person';
const TRACEBACK_PATH = winHome(STRANGER, 'AppData\\Local\\Programs\\Python\\Python311\\Lib\\site-packages\\torch\\nn\\module.py');
const PERSONAL_MAIL = mailbox(PERSON, 'gmail.com');
const ORG_MAIL = mailbox('security', 'project.example');

let server: Server;
let baseUrl: string;
let workDir: string;
let packPath: string;

const longParagraph = (lead: string) => `${lead} ${'Durable export runtime verification details for mobile and web targets. '.repeat(4)}`;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/issue-thread') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<html><head><title>Issue Thread</title></head><body><article><h1>Issue Thread</h1>` +
          `<pre>Traceback (most recent call last):\n  File "${TRACEBACK_PATH}", line 1501, in _call_impl</pre>` +
          `<p>${longParagraph(`Reported by ${PERSONAL_MAIL}.`)}</p>` +
          `<p>${longParagraph(`Report vulnerabilities to ${ORG_MAIL}.`)}</p>` +
          `</article></body></html>`,
      );
      return;
    }
    if (req.url === '/clean-page') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<html><head><title>Clean Page</title></head><body><article><h1>Clean Page</h1>` +
          `<p>${longParagraph('Nothing personal here.')}</p>` +
          `</article></body></html>`,
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'research-os-personal-'));
  packPath = (await init({ topic: 'How does ingestion redact personal data?', outDir: workDir })).packPath;
  await sectionAdd({ id: '01-landscape', purpose: 'Verify personal-data redaction at ingestion', packPath });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('redactThirdPartyPersonalData: home paths', () => {
  it('replaces the account in a Windows path and keeps the separators and the rest of the path', () => {
    const { text, redactionCount } = redactThirdPartyPersonalData(`File "${TRACEBACK_PATH}", line 1`);
    expect(redactionCount).toBe(1);
    expect(text).toBe(`File "${winHome(PERSONAL_USER_REDACTED_MARKER, 'AppData\\Local\\Programs\\Python\\Python311\\Lib\\site-packages\\torch\\nn\\module.py')}", line 1`);
    expect(text).not.toContain(STRANGER);
  });

  it('reads the doubled separators JSON and Python reprs write', () => {
    const { text, redactionCount } = redactThirdPartyPersonalData(`"path": "${jsonHome(STRANGER, 'proj')}"`);
    expect(redactionCount).toBe(1);
    expect(text).toBe(`"path": "${jsonHome(PERSONAL_USER_REDACTED_MARKER, 'proj')}"`);
  });

  it('reads forward-slash, MSYS and macOS forms, and the admin-share spelling', () => {
    const input = [
      `C:/Users/${STRANGER}/repo`,
      `/c/Users/${STRANGER}/repo`,
      `/mnt/c/Users/${STRANGER}/repo`,
      `/Users/${STRANGER}/Library`,
      `${BS}${BS}host${BS}C$${BS}Users${BS}${STRANGER}${BS}repo`,
    ].join('\n');
    const { text, redactionCount } = redactThirdPartyPersonalData(input);
    expect(redactionCount).toBe(5);
    expect(text).not.toContain(STRANGER);
    expect(text.split(PERSONAL_USER_REDACTED_MARKER)).toHaveLength(6);
  });

  it('reads a percent-encoded path', () => {
    const { text, redactionCount } = redactThirdPartyPersonalData(`href=C%3A%5CUsers%5C${STRANGER}%5Cdocs`);
    expect(redactionCount).toBe(1);
    expect(text).toBe(`href=C%3A%5CUsers%5C${PERSONAL_USER_REDACTED_MARKER}%5Cdocs`);
  });

  it('counts one account once even when two patterns find it', () => {
    // A drive path is also a path the macOS pattern reads, since a colon is not a word character.
    expect(redactThirdPartyPersonalData(winHome(STRANGER, 'x')).redactionCount).toBe(1);
  });

  it('leaves the shared profiles, REST routes and URL paths alone', () => {
    const input = [`C:${BS}Users${BS}Public${BS}Documents`, `C:${BS}Users${BS}Default${BS}NTUSER.DAT`, `C:${BS}Users${BS}All Users${BS}x`, 'GET /users/me', 'https://host.example/Users/profile', 'C:\\Users\\'].join('\n');
    const { text, redactionCount } = redactThirdPartyPersonalData(input);
    expect(redactionCount).toBe(0);
    expect(text).toBe(input);
  });

  it('keeps an account with a dot, a hyphen, a digit or a non-ASCII letter together', () => {
    for (const account of ['first.last', 'a-b', 'user01', 'josé']) {
      const { text, redactionCount } = redactThirdPartyPersonalData(winHome(account, 'x'));
      expect(redactionCount).toBe(1);
      expect(text).toBe(winHome(PERSONAL_USER_REDACTED_MARKER, 'x'));
    }
  });
});

describe('redactThirdPartyPersonalData: addresses', () => {
  it('replaces a personal mailbox address on each consumer provider', () => {
    for (const domain of ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'proton.me', 'protonmail.com', 'aol.com']) {
      const { text, redactionCount } = redactThirdPartyPersonalData(`write to ${mailbox(PERSON, domain)} today`);
      expect(redactionCount).toBe(1);
      expect(text).toBe(`write to ${PERSONAL_EMAIL_REDACTED_MARKER} today`);
    }
  });

  it('matches the provider case-insensitively and takes plus-tags and dots in the local part', () => {
    const { text, redactionCount } = redactThirdPartyPersonalData(mailbox('First.Last+tag', 'GMAIL.COM'));
    expect(redactionCount).toBe(1);
    expect(text).toBe(PERSONAL_EMAIL_REDACTED_MARKER);
  });

  it('leaves an organisational or support address alone', () => {
    const input = [ORG_MAIL, mailbox('support', 'vendor.example'), mailbox('noreply', 'github.com'), mailbox('me', 'gmail.com.example')].join(' ');
    const { text, redactionCount } = redactThirdPartyPersonalData(input);
    expect(redactionCount).toBe(0);
    expect(text).toBe(input);
  });
});

describe('redactThirdPartyPersonalData: properties', () => {
  it('returns text with nothing to redact unchanged and reports zero', () => {
    const input = '<html><body><p>Nothing personal here.</p></body></html>';
    expect(redactThirdPartyPersonalData(input)).toEqual({ text: input, redactionCount: 0 });
  });

  it('is idempotent: a marker is never matched again', () => {
    const once = redactThirdPartyPersonalData(`${TRACEBACK_PATH} ${PERSONAL_MAIL}`);
    expect(once.redactionCount).toBe(2);
    const twice = redactThirdPartyPersonalData(once.text);
    expect(twice.redactionCount).toBe(0);
    expect(twice.text).toBe(once.text);
  });

  it('adds up with key redaction on the same text', () => {
    const key = 'AIza' + 'SyB1c2D3e4F5g6H7i8J9k0L1m2N3o4P5q6R';
    const keys = redactThirdPartyKeys(`${key} ${TRACEBACK_PATH}`);
    const personal = redactThirdPartyPersonalData(keys.text);
    expect(keys.redactionCount + personal.redactionCount).toBe(2);
  });
});

describe('ingestion in fetchOnce and gather', () => {
  it('redacts a traceback path and a personal address, keeps the organisational address, and records it', async () => {
    const summary = await gather({
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/issue-thread`],
      extractors: [new HeuristicExtractor()],
    });
    expect(summary.fetchedOk).toBe(1);
    const sid = summary.sourceIds[0]!;

    const rawDisk = await readFile(join(packPath, 'evidence', 'raw', `${sid}.html`), 'utf8');
    expect(rawDisk).not.toContain(STRANGER);
    expect(rawDisk).not.toContain(PERSON);
    expect(rawDisk).toContain(PERSONAL_USER_REDACTED_MARKER);
    expect(rawDisk).toContain(PERSONAL_EMAIL_REDACTED_MARKER);
    expect(rawDisk).toContain(ORG_MAIL);

    const logLine = (await readFile(join(packPath, 'evidence', 'fetch-log.jsonl'), 'utf8')).trim().split('\n')[0]!;
    const receipt = FetchReceiptSchema.parse(JSON.parse(logLine));
    expect(receipt.redaction_count).toBe(2);
    expect(receipt.sha256).toBe(createHash('sha256').update(Buffer.from(rawDisk, 'utf8')).digest('hex'));
    expect(receipt.byte_count).toBe(Buffer.byteLength(rawDisk, 'utf8'));
    // The hash of the bytes as fetched survives as provenance, and differs from the stored file's.
    const asServed = `<html><head><title>Issue Thread</title></head><body><article><h1>Issue Thread</h1>` +
      `<pre>Traceback (most recent call last):\n  File "${TRACEBACK_PATH}", line 1501, in _call_impl</pre>` +
      `<p>${longParagraph(`Reported by ${PERSONAL_MAIL}.`)}</p>` +
      `<p>${longParagraph(`Report vulnerabilities to ${ORG_MAIL}.`)}</p>` +
      `</article></body></html>`;
    expect(receipt.fetched_sha256).toBe(createHash('sha256').update(Buffer.from(asServed, 'utf8')).digest('hex'));
    expect(receipt.fetched_sha256).not.toBe(receipt.sha256);

    const card = SourceCardSchema.parse(JSON.parse(await readFile(join(packPath, 'evidence', 'source-cards', `${sid}.json`), 'utf8')));
    expect(card.redaction_count).toBe(2);
    expect(card.redaction_note).toContain('Ingestion redacted 2 third-party item(s)');
    expect(card.redaction_note).toContain('fetched_sha256');
    expect(card.redaction_note).not.toContain(STRANGER);
  });

  it('leaves a clean page byte for byte, with no fetched_sha256 and no redaction note', async () => {
    const { receipt: direct, rawText } = await fetchOnce(`${baseUrl}/clean-page`, {
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
    });
    expect(direct.redaction_count).toBe(0);
    expect(direct.fetched_sha256).toBeUndefined();
    expect(rawText).toContain('Nothing personal here.');
    expect(direct.sha256).toBe(createHash('sha256').update(Buffer.from(rawText!, 'utf8')).digest('hex'));

    const summary = await gather({
      sectionId: '01-landscape',
      packPath,
      unsafeAllowAllHosts: true,
      urls: [`${baseUrl}/clean-page`],
      extractors: [new HeuristicExtractor()],
    });
    const sid = summary.sourceIds[0]!;
    const card = SourceCardSchema.parse(JSON.parse(await readFile(join(packPath, 'evidence', 'source-cards', `${sid}.json`), 'utf8')));
    expect(card.redaction_count).toBe(0);
    expect(card.redaction_note).toBeUndefined();
  });
});
