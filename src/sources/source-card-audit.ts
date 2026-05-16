/**
 * Source-card audit — v0.4 Component D, v0.10 Slice 3 extension.
 *
 * runSourceCardAudit: reads all source cards + override ledger, re-runs the
 * classifier per card, computes effective view, assigns one of N
 * advisor-locked finding kinds, writes audits/source-card-audit.{json,md},
 * and returns the report.
 *
 * v0.10 Slice 3 (R-003 + R-005): adds severity-detection pass. The audit
 * reads fetch-log.jsonl for each card's latest receipt + the body raw text
 * (when text-like), runs detectSeverities, and elevates the finding `kind`
 * above the existing classifier-precedence chain when severities fire.
 * Operator overrides via clear_severities[] clear the severity from the
 * effective finding without modifying source-card files.
 *
 * applySourceCardOverrides: validates a proposed-override JSON array in full,
 * then appends all entries to the ledger. Refuses frozen packs. Refuses partial
 * batches — all-or-nothing validation.
 *
 * Read-only by default. --apply --from <file> is the only write path.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { ResearchOSError } from '../errors.js';
import { ResearchYamlSchema } from '../intake/schema.js';
import { FetchReceiptSchema, SourceCardSchema, type FetchReceipt, type SourceCard } from './schema.js';
import { appendOverride, readOverrides } from './source-card-overrides.js';
import {
  validateSourceCardOverride,
  type SourceCardOverride,
} from './source-card-overrides-schema.js';
import {
  getEffectiveSourceType,
  getEffectivePublisher,
  getEffectiveSeverities,
  type SourceType,
} from './effective-card.js';
import { classifySourceType } from './source-type-classifier.js';
import {
  detectSeverities,
  resolveSeverityThresholds,
  type SeverityFinding,
  type SeverityThresholds,
} from './severities.js';
import { RESEARCH_OS_VERSION } from '../index.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type FindingKind =
  | 'bot_check_or_captcha_detected'
  | 'extraction_suspect_word_count_mismatch'
  | 'source_identity_mismatch'
  | 'github_ui_html'
  | 'classifier_flagged'
  | 'source_type_mismatch'
  | 'publisher_mismatch'
  | 'publisher_missing'
  | 'override_applied'
  | 'no_action';

export interface FindingRow {
  source_id: string;
  url: string;
  kind: FindingKind;
  raw_source_type: string;
  classifier_source_type: string;
  effective_source_type: string;
  raw_publisher: string | null;
  effective_publisher: string | null;
  classifier_rule_hint: string;
  classifier_precedence_level: number;
  override_in_effect: boolean;
  /** v0.10 Slice 3 — effective (post-override) severities for this card. */
  severities?: SeverityFinding[];
}

export interface AuditTotals {
  cards_scanned: number;
  cards_with_overrides: number;
  source_type_mismatches: number;
  publisher_missing: number;
  github_ui_html: number;
  classifier_flagged_other: number;
  /** v0.10 Slice 3 — count of cards whose effective kind is bot_check_or_captcha_detected. */
  bot_check_or_captcha_detected: number;
  /** v0.10 Slice 3 — count of cards whose effective kind is extraction_suspect_word_count_mismatch. */
  extraction_suspect_word_count_mismatch: number;
  /** v0.11 Slice 3 — count of cards whose effective kind is source_identity_mismatch. */
  source_identity_mismatch: number;
  no_action: number;
}

export interface AuditReport {
  schema_version: 1;
  pack_path: string;
  audited_at: string;
  research_os_version: string;
  totals: AuditTotals;
  findings: FindingRow[];
}

export interface AuditResult {
  report: AuditReport;
  jsonPath: string;
  mdPath: string;
}

export interface ApplyResult {
  applied: number;
  ledgerPath: string;
  distinctSourceIds: number;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function hasSourceTypeOverride(card: SourceCard, overrides: SourceCardOverride[]): boolean {
  return overrides.some((o) => o.source_id === card.source_id && o.new_source_type != null);
}

function hasPublisherOverride(card: SourceCard, overrides: SourceCardOverride[]): boolean {
  return overrides.some((o) => o.source_id === card.source_id && o.new_publisher !== undefined);
}

function hasSeverityClearOverride(card: SourceCard, overrides: SourceCardOverride[]): boolean {
  return overrides.some(
    (o) =>
      o.source_id === card.source_id &&
      Array.isArray(o.clear_severities) &&
      o.clear_severities.length > 0,
  );
}

/**
 * Load fetch-log.jsonl receipts indexed by source_id (latest fetched_at wins).
 * v0.10 Slice 3 needs this to wire raw-text body to detectSeverities.
 *
 * Exported for R-013 (v0.12 Slice 2) so the rebuild orchestrator reads
 * receipts identically to the audit path — single source of truth.
 */
export async function loadLatestReceipts(packPath: string): Promise<Map<string, FetchReceipt>> {
  const path = join(packPath, 'evidence', 'fetch-log.jsonl');
  const map = new Map<string, FetchReceipt>();
  if (!existsSync(path)) return map;
  const text = await readFile(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = FetchReceiptSchema.parse(JSON.parse(line));
      const prev = map.get(r.source_id);
      if (!prev || r.fetched_at > prev.fetched_at) map.set(r.source_id, r);
    } catch {
      /* skip malformed line */
    }
  }
  return map;
}

/**
 * Read the cached body for a fetch receipt. Returns null when the receipt
 * has no raw_text_path (e.g. PDFs) or when the cached file is missing.
 *
 * Exported for R-013 (v0.12 Slice 2) so rebuild reads cached body via the
 * same path the audit does — preserves the "no re-fetch" invariant.
 */
export async function loadRawText(packPath: string, receipt: FetchReceipt | null): Promise<string | null> {
  if (!receipt || !receipt.raw_text_path) return null;
  const abs = join(packPath, receipt.raw_text_path);
  if (!existsSync(abs)) return null;
  try {
    return await readFile(abs, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Resolve per-pack severity thresholds from research.yaml's
 * audit.severity_thresholds block, falling back to defaults on any read /
 * parse failure. Exported for R-013 so rebuild uses the same thresholds
 * an audit would — defense-floor evaluation is consistent across surfaces.
 */
export async function loadSeverityThresholds(packPath: string): Promise<SeverityThresholds> {
  const yamlPath = join(packPath, 'research.yaml');
  if (!existsSync(yamlPath)) return resolveSeverityThresholds(null);
  try {
    const parsed = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));
    return resolveSeverityThresholds(parsed.audit?.severity_thresholds);
  } catch {
    return resolveSeverityThresholds(null);
  }
}

/**
 * Assign exactly one finding kind per the advisor-locked precedence order.
 *
 * v0.10 Slice 3 / v0.11 Slice 3 precedence (highest first):
 *   bot_check_or_captcha_detected → extraction_suspect_word_count_mismatch
 *   → source_identity_mismatch → github_ui_html → classifier_flagged
 *   → source_type_mismatch → publisher_mismatch → publisher_missing
 *   → override_applied → no_action
 *
 * source_identity_mismatch is the v0.11 Slice 3 (R-009) extractor-identity
 * guard — placed third because the two upstream signals are about the
 * fetched body (bot-check) and the extracted card mass (word-count) — both
 * upstream of identity comparison. Within the severity band the precedence
 * is informational only (each individual severity is counted independently
 * in totals; kind is the dominant headline).
 *
 * source_type_mismatch guards against rule_hint === 'no-rule-match' to avoid
 * false positives on extractor-typed cards (e.g. arxiv.org typed 'primary' by
 * extractor when classifier has no matching rule).
 */
function determineFinding(
  card: SourceCard,
  overrides: SourceCardOverride[],
  effectiveSeverities: SeverityFinding[],
): FindingKind {
  // v0.10 Slice 3 — severity findings take precedence (HARD FAIL first).
  if (effectiveSeverities.some((f) => f.severity === 'bot_check_or_captcha_detected')) {
    return 'bot_check_or_captcha_detected';
  }
  if (effectiveSeverities.some((f) => f.severity === 'extraction_suspect_word_count_mismatch')) {
    return 'extraction_suspect_word_count_mismatch';
  }
  // v0.11 Slice 3 (R-009) — source-card identity guard.
  if (effectiveSeverities.some((f) => f.severity === 'source_identity_mismatch')) {
    return 'source_identity_mismatch';
  }

  const classification = classifySourceType({ url: card.url });
  const stOverride = hasSourceTypeOverride(card, overrides);
  const pubOverride = hasPublisherOverride(card, overrides);
  const sevOverride = hasSeverityClearOverride(card, overrides);

  if (classification.rule_hint === 'flagged:github-ui-html') return 'github_ui_html';

  if (classification.rule_hint.startsWith('flagged:')) return 'classifier_flagged';

  if (
    classification.rule_hint !== 'no-rule-match' &&
    classification.source_type !== card.source_type &&
    !stOverride
  ) {
    return 'source_type_mismatch';
  }

  // publisher_mismatch: forward-compatible bucket — classifier exposes no publisher_hint today.

  if (card.publisher === null && !pubOverride) return 'publisher_missing';

  if (stOverride || pubOverride || sevOverride) return 'override_applied';

  return 'no_action';
}

function buildMarkdown(report: AuditReport): string {
  const packName = report.pack_path.replace(/\\/g, '/').split('/').pop() ?? report.pack_path;
  const t = report.totals;

  const lines: string[] = [
    `# Source-Card Audit Report`,
    ``,
    `**Pack:** ${packName}`,
    `**Audited at:** ${report.audited_at}`,
    `**research-os:** ${report.research_os_version}`,
    ``,
    `## Totals`,
    ``,
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Cards scanned | ${t.cards_scanned} |`,
    `| Cards with overrides | ${t.cards_with_overrides} |`,
    `| Bot-check / CAPTCHA detected | ${t.bot_check_or_captcha_detected} |`,
    `| Extraction word-count mismatch | ${t.extraction_suspect_word_count_mismatch} |`,
    `| Source-identity mismatch (R-009) | ${t.source_identity_mismatch} |`,
    `| Source-type mismatches | ${t.source_type_mismatches} |`,
    `| Publisher missing | ${t.publisher_missing} |`,
    `| GitHub UI HTML candidates | ${t.github_ui_html} |`,
    `| Classifier-flagged (other) | ${t.classifier_flagged_other} |`,
    `| Clean (no action) | ${t.no_action} |`,
  ];

  if (report.findings.length > 0) {
    lines.push(
      ``,
      `## Findings`,
      ``,
      `| source_id | URL | Kind | Raw type | Classifier type | Effective type | Override? | Severity reasons |`,
      `|-----------|-----|------|----------|-----------------|----------------|-----------|------------------|`,
    );
    for (const f of report.findings) {
      const urlShort = f.url.length > 60 ? f.url.slice(0, 57) + '...' : f.url;
      const sevSummary = (f.severities ?? [])
        .map((s) => `${s.severity}: ${s.reasons.join(', ')}`)
        .join(' | ');
      lines.push(
        `| ${f.source_id} | ${urlShort} | ${f.kind} | ${f.raw_source_type} | ${f.classifier_source_type} | ${f.effective_source_type} | ${f.override_in_effect ? 'yes' : 'no'} | ${sevSummary || '—'} |`,
      );
    }
  }

  return lines.join('\n') + '\n';
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a read-only source-card audit on a pack.
 *
 * Reads all source cards from evidence/source-cards/, loads the override
 * ledger, re-runs the classifier per card, runs severity detection
 * (v0.10 Slice 3), assigns a finding kind, and writes
 * audits/source-card-audit.{json,md}.
 *
 * Safe on frozen packs — does not touch evidence/ or the override ledger.
 */
export async function runSourceCardAudit(packPath: string): Promise<AuditResult> {
  const cardsDir = join(packPath, 'evidence', 'source-cards');
  if (!existsSync(cardsDir)) {
    // C1-013: structured error. Closest existing code: PACK_NOT_FOUND
    // (pack lacks a required sub-directory).
    throw new ResearchOSError(
      `Pack directory does not contain evidence/source-cards/: ${packPath}`,
      'PACK_NOT_FOUND',
      `Run \`research-os gather <section>\` to produce source cards before auditing. See handbook/recovery.md.`,
    );
  }

  const entries = await readdir(cardsDir);
  const cardFiles = entries.filter((f) => f.endsWith('.json'));

  const cards: SourceCard[] = [];
  for (const file of cardFiles) {
    const raw = await readFile(join(cardsDir, file), 'utf8');
    cards.push(SourceCardSchema.parse(JSON.parse(raw)));
  }

  const overrides = await readOverrides(packPath);
  const receipts = await loadLatestReceipts(packPath);
  const thresholds = await loadSeverityThresholds(packPath);

  const totals: AuditTotals = {
    cards_scanned: cards.length,
    cards_with_overrides: 0,
    source_type_mismatches: 0,
    publisher_missing: 0,
    github_ui_html: 0,
    classifier_flagged_other: 0,
    bot_check_or_captcha_detected: 0,
    extraction_suspect_word_count_mismatch: 0,
    source_identity_mismatch: 0,
    no_action: 0,
  };

  const findings: FindingRow[] = [];

  for (const card of cards) {
    const classification = classifySourceType({ url: card.url });
    const effectiveSourceType: SourceType = getEffectiveSourceType(card, overrides);
    const effectivePublisher = getEffectivePublisher(card, overrides);
    const stOverride = hasSourceTypeOverride(card, overrides);
    const pubOverride = hasPublisherOverride(card, overrides);
    const sevOverride = hasSeverityClearOverride(card, overrides);
    const overrideInEffect = stOverride || pubOverride || sevOverride;

    if (overrideInEffect) totals.cards_with_overrides++;

    // v0.10 Slice 3 — detect severities (raw) then apply override layer.
    const receipt = receipts.get(card.source_id) ?? null;
    const rawText = await loadRawText(packPath, receipt);
    const rawSeverities = detectSeverities({
      card,
      rawText,
      byteCount: receipt?.byte_count ?? null,
      contentType: receipt?.content_type ?? null,
      fetchDurationMs: receipt?.fetch_duration_ms ?? null,
      thresholds,
    });
    const effectiveSeverities = getEffectiveSeverities(card, rawSeverities, overrides);

    const kind = determineFinding(card, overrides, effectiveSeverities);

    // v0.10 Slice 3 / v0.11 Slice 3 — severity totals count each severity
    // independently, not the dominant `kind`. A card whose effective
    // severities include any combination of bot_check_or_captcha_detected,
    // extraction_suspect_word_count_mismatch, and source_identity_mismatch
    // contributes 1 to each total (and surfaces in findings[].severities).
    for (const s of effectiveSeverities) {
      if (s.severity === 'bot_check_or_captcha_detected') {
        totals.bot_check_or_captcha_detected++;
      } else if (s.severity === 'extraction_suspect_word_count_mismatch') {
        totals.extraction_suspect_word_count_mismatch++;
      } else if (s.severity === 'source_identity_mismatch') {
        totals.source_identity_mismatch++;
      }
    }

    switch (kind) {
      case 'source_type_mismatch': totals.source_type_mismatches++; break;
      case 'publisher_missing':    totals.publisher_missing++;       break;
      case 'github_ui_html':       totals.github_ui_html++;          break;
      case 'classifier_flagged':   totals.classifier_flagged_other++; break;
      case 'bot_check_or_captcha_detected':
      case 'extraction_suspect_word_count_mismatch':
      case 'source_identity_mismatch':
        // Severity totals already incremented above per-severity.
        break;
      case 'override_applied':     // informational — falls into no_action bucket
      case 'no_action':            totals.no_action++;               break;
      case 'publisher_mismatch':   break; // forward-compatible, no counter
    }

    findings.push({
      source_id: card.source_id,
      url: card.url,
      kind,
      raw_source_type: card.source_type,
      classifier_source_type: classification.source_type,
      effective_source_type: effectiveSourceType,
      raw_publisher: card.publisher,
      effective_publisher: effectivePublisher,
      classifier_rule_hint: classification.rule_hint,
      classifier_precedence_level: classification.precedence_level,
      override_in_effect: overrideInEffect,
      severities: effectiveSeverities,
    });
  }

  const report: AuditReport = {
    schema_version: 1,
    pack_path: packPath,
    audited_at: new Date().toISOString(),
    research_os_version: RESEARCH_OS_VERSION,
    totals,
    findings,
  };

  const auditsDir = join(packPath, 'audits');
  await mkdir(auditsDir, { recursive: true });

  const jsonPath = join(auditsDir, 'source-card-audit.json');
  const mdPath = join(auditsDir, 'source-card-audit.md');

  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(mdPath, buildMarkdown(report), 'utf8');

  return { report, jsonPath, mdPath };
}

/**
 * Apply operator-authored overrides from a JSON array file.
 *
 * Refuses frozen packs (audits/freeze-receipt.json present).
 * Validates all entries via Session 3's validateSourceCardOverride — all-or-nothing.
 * Appends validated entries to the ledger via appendOverride.
 */
export async function applySourceCardOverrides(
  packPath: string,
  fromFile: string,
): Promise<ApplyResult> {
  const freezeReceipt = join(packPath, 'audits', 'freeze-receipt.json');
  if (existsSync(freezeReceipt)) {
    // C1-013: frozen-pack refusal. Closest existing code: SYNTHESIS_NOT_READY
    // ("pack is in a state that refuses writes"). See escalation note —
    // a dedicated PACK_FROZEN code would programmatically distinguish frozen
    // refusals from synthesis-not-ready refusals.
    throw new ResearchOSError(
      `Cannot apply overrides to a frozen pack. audits/freeze-receipt.json is present (pack: ${packPath}).`,
      'SYNTHESIS_NOT_READY',
      `Use a fresh (non-frozen) copy of the pack for operator corrections, or run \`research-os invalidate extraction --reason "..."\` to clear frozen_at before applying overrides. See handbook/recovery.md.`,
    );
  }

  let rawContent: string;
  try {
    rawContent = await readFile(fromFile, 'utf8');
  } catch (err) {
    // C1-013: file-read failure. PACK_NOT_FOUND broadens to "operator-supplied
    // file not readable" — see escalation note.
    throw new ResearchOSError(
      `Cannot read override file: ${fromFile}`,
      'PACK_NOT_FOUND',
      `Check the path passed to --from. The override file must be a readable JSON array at the supplied path.`,
      err instanceof Error ? err : undefined,
    );
  }

  let entries: unknown[];
  try {
    const parsed: unknown = JSON.parse(rawContent);
    if (!Array.isArray(parsed)) {
      // C1-013: schema-shape validation.
      throw new ResearchOSError(
        'Override file must be a JSON array at the top level.',
        'INTAKE_VALIDATION',
        `Edit ${fromFile} so the top-level value is a JSON array of override objects. See handbook/recovery.md.`,
      );
    }
    entries = parsed;
  } catch (err) {
    if (err instanceof ResearchOSError) throw err;
    // C1-013: JSON parse failure. PACK_PARSE_ERROR is the existing code for
    // "JSON parse failed in a pack-adjacent file".
    throw new ResearchOSError(
      `Override file parse error: ${err instanceof Error ? err.message : String(err)}`,
      'PACK_PARSE_ERROR',
      `Inspect ${fromFile} for malformed JSON. See handbook/recovery.md.`,
      err instanceof Error ? err : undefined,
    );
  }

  // Validate all entries before writing any — all-or-nothing.
  const validated: SourceCardOverride[] = [];
  for (let i = 0; i < entries.length; i++) {
    try {
      validated.push(validateSourceCardOverride(entries[i]));
    } catch (err) {
      // C1-013: per-entry validation failure.
      throw new ResearchOSError(
        `Override entry ${i + 1} failed validation: ${err instanceof Error ? err.message : String(err)}`,
        'INTAKE_VALIDATION',
        `Fix the schema violation at entry ${i + 1} of ${fromFile}. See handbook/recovery.md.`,
        err instanceof Error ? err : undefined,
      );
    }
  }

  for (const entry of validated) {
    await appendOverride(packPath, entry);
  }

  const ledgerPath = join(packPath, 'evidence', 'source-card-overrides.jsonl');
  const distinctSourceIds = new Set(validated.map((e) => e.source_id)).size;

  return { applied: validated.length, ledgerPath, distinctSourceIds };
}
