/**
 * Source-card audit — v0.4 Component D.
 *
 * runSourceCardAudit: reads all source cards + override ledger, re-runs the
 * classifier per card, computes effective view, assigns one of 7 advisor-locked
 * finding kinds, writes audits/source-card-audit.{json,md}, and returns the report.
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

import { ResearchOSError } from '../errors.js';
import { SourceCardSchema, type SourceCard } from './schema.js';
import { readOverrides, appendOverride } from './source-card-overrides.js';
import {
  validateSourceCardOverride,
  type SourceCardOverride,
} from './source-card-overrides-schema.js';
import { getEffectiveSourceType, getEffectivePublisher, type SourceType } from './effective-card.js';
import { classifySourceType } from './source-type-classifier.js';
import { RESEARCH_OS_VERSION } from '../index.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type FindingKind =
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
}

export interface AuditTotals {
  cards_scanned: number;
  cards_with_overrides: number;
  source_type_mismatches: number;
  publisher_missing: number;
  github_ui_html: number;
  classifier_flagged_other: number;
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

/**
 * Assign exactly one finding kind per the advisor-locked precedence order:
 * github_ui_html → classifier_flagged → source_type_mismatch → publisher_mismatch
 * → publisher_missing → override_applied → no_action.
 *
 * source_type_mismatch guards against rule_hint === 'no-rule-match' to avoid
 * false positives on extractor-typed cards (e.g. arxiv.org typed 'primary' by
 * extractor when classifier has no matching rule).
 */
function determineFinding(
  card: SourceCard,
  overrides: SourceCardOverride[],
): FindingKind {
  const classification = classifySourceType({ url: card.url });
  const stOverride = hasSourceTypeOverride(card, overrides);
  const pubOverride = hasPublisherOverride(card, overrides);

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

  if (stOverride || pubOverride) return 'override_applied';

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
      `| source_id | URL | Kind | Raw type | Classifier type | Effective type | Override? |`,
      `|-----------|-----|------|----------|-----------------|----------------|-----------|`,
    );
    for (const f of report.findings) {
      const urlShort = f.url.length > 60 ? f.url.slice(0, 57) + '...' : f.url;
      lines.push(
        `| ${f.source_id} | ${urlShort} | ${f.kind} | ${f.raw_source_type} | ${f.classifier_source_type} | ${f.effective_source_type} | ${f.override_in_effect ? 'yes' : 'no'} |`,
      );
    }
  }

  return lines.join('\n') + '\n';
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a read-only source-card audit on a pack.
 *
 * Reads all source cards from evidence/source-cards/, loads the override ledger,
 * re-runs the classifier per card, assigns a finding kind, and writes
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

  const totals: AuditTotals = {
    cards_scanned: cards.length,
    cards_with_overrides: 0,
    source_type_mismatches: 0,
    publisher_missing: 0,
    github_ui_html: 0,
    classifier_flagged_other: 0,
    no_action: 0,
  };

  const findings: FindingRow[] = [];

  for (const card of cards) {
    const classification = classifySourceType({ url: card.url });
    const effectiveSourceType: SourceType = getEffectiveSourceType(card, overrides);
    const effectivePublisher = getEffectivePublisher(card, overrides);
    const stOverride = hasSourceTypeOverride(card, overrides);
    const pubOverride = hasPublisherOverride(card, overrides);
    const overrideInEffect = stOverride || pubOverride;

    if (overrideInEffect) totals.cards_with_overrides++;

    const kind = determineFinding(card, overrides);

    switch (kind) {
      case 'source_type_mismatch': totals.source_type_mismatches++; break;
      case 'publisher_missing':    totals.publisher_missing++;       break;
      case 'github_ui_html':       totals.github_ui_html++;          break;
      case 'classifier_flagged':   totals.classifier_flagged_other++; break;
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
