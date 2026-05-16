/**
 * v0.10 Slice 2 — R-001: scope-repair engine.
 * v0.11 Slice 1 — R-007: alignment with triage's "substantive claim"
 *   requirement. Triage demands BOTH `scope` AND `not` for substantive
 *   claims (rule 1.2 parked_weak_scope, rule 1.3 needs_scope_repair). R-001
 *   filled only scope, so a claim originally in parked_weak_scope (both
 *   null, asserts>80) became needs_scope_repair (scope=set, not=null,
 *   asserts>80) after the repair — the operator ran the instructed repair
 *   and remained blocked. R-007 fills BOTH fields when `not` is null at
 *   repair time. The reverse-asymmetric case (scope=set, not=null) remains
 *   outside repair-scope's candidate set by design; a future sibling
 *   action can address it if operator evidence demands.
 *
 * Operator-facing surface that fixes the operator-aloneness DST gate v0.1
 * blocker (and now v0.2's R-007 alignment gap): claims arrive with
 * scope=null (and often also not=null). Triage parks them. R-001+R-007
 * surfaces a CLI repair that aligns with triage's actual classification.
 *
 * Flow:
 *   1. Read claims.jsonl + source cards + research.yaml.
 *   2. Identify claims with scope === null (mode-irrespective).
 *   3. For each candidate, call proposeScopeForClaim() — pure heuristic.
 *   4. Auto mode: apply proposed_scope. ALSO apply proposed_not when
 *      claim.not === null (R-007 alignment). Append ledger record
 *      recording proposed/applied values for both fields.
 *   5. Interactive mode: prompt operator. The prompter sees proposed_scope
 *      and proposed_not + a flag indicating whether boundary-repair is
 *      needed. Accept → apply both proposals (boundary applied only when
 *      claim.not === null). Edit → operator supplies new_scope and
 *      optionally new_not; fallback to proposed_not when omitted. Skip
 *      → no claim mutation; ledger records the skip. Quit → halt.
 *   6. Each non-skip path rewrites claims.jsonl with the resolved scope
 *      and (when applicable) the resolved boundary.
 *
 * Frozen-pack guard: refuses to run when audits/freeze-receipt.json exists.
 * Mirrors source-card audit --apply behavior.
 *
 * The CLI invokes this engine; tests call it directly. The Prompter is
 * injectable so interactive-mode logic can be exercised without driving
 * stdin.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { PackNotFoundError, SectionNotFoundError } from '../errors.js';
import { RESEARCH_OS_VERSION } from '../index.js';
import { ClaimSchema, type Claim } from './schema.js';
import { SourceCardSchema, type SourceCard } from '../sources/schema.js';
import { ResearchYamlSchema } from '../intake/schema.js';
import { appendScopeRepair, scopeRepairsLedgerPath } from './scope-repairs.js';
import { proposeScopeForClaim } from './scope-proposer.js';
import {
  ScopeRepairSchema,
  type ScopeRepair,
} from './scope-repairs-schema.js';

export type ScopeRepairMode = 'auto' | 'interactive';

export interface ScopeRepairPrompterContext {
  claim_id: string;
  asserts: string;
  section_id: string;
  section_purpose: string;
  source_card_summary: string;
  proposed_scope: string;
  // R-007: the proposer always computes a boundary string; the prompter
  // displays it. The engine applies the boundary only when claim.not is
  // null at repair time (`needs_not_repair === true` below); otherwise the
  // claim's existing `not` is preserved.
  proposed_not: string;
  // R-007: convenience flag derived from the claim's state at repair time.
  // true when claim.not === null and the engine intends to apply the
  // boundary proposal. UIs (CLI / future TUI) can use this to decide
  // whether to show the boundary editor.
  needs_not_repair: boolean;
}

export type ScopeRepairPrompterResponse =
  | { action: 'accept' }
  // R-007: edit accepts a required new_scope and an optional new_not.
  // When new_not is omitted but the engine intended to apply a boundary
  // (needs_not_repair === true), the engine falls back to proposed_not.
  // This preserves back-compat with v0.10 prompter scripts that only
  // supplied new_scope while still honoring the R-007 alignment.
  | { action: 'edit'; new_scope: string; new_not?: string }
  | { action: 'skip'; reason?: string }
  | { action: 'quit' };

export interface ScopeRepairPrompter {
  promptScopeProposal(context: ScopeRepairPrompterContext): Promise<ScopeRepairPrompterResponse>;
}

export interface ScopeRepairOptions {
  sectionId: string;
  packPath: string;
  mode: ScopeRepairMode;
  operator: string;
  prompter?: ScopeRepairPrompter;
  now?: () => Date;
}

export interface ScopeRepairResult {
  sectionId: string;
  claimsConsidered: number;
  claimsRepaired: number;
  claimsSkipped: number;
  quitEarly: boolean;
  ledgerPath: string;
  claimsJsonlPath: string;
  appliedScopeByClaimId: Record<string, string>;
}

class FrozenPackError extends Error {
  constructor(packPath: string) {
    super(
      `Refusing to repair scope on a frozen pack at ${packPath}. Unfreeze the pack (or run on a fresh working copy) before applying repairs.`,
    );
    this.name = 'FrozenPackError';
  }
}

class PrompterRequiredError extends Error {
  constructor() {
    super('Interactive mode requires a prompter. Pass `prompter` to runScopeRepair().');
    this.name = 'PrompterRequiredError';
  }
}

async function readResearchYaml(packPath: string): Promise<ReturnType<typeof ResearchYamlSchema.parse>> {
  const path = join(packPath, 'research.yaml');
  if (!existsSync(path)) throw new PackNotFoundError(packPath);
  return ResearchYamlSchema.parse(yamlParse(await readFile(path, 'utf8')));
}

async function readClaimsJsonl(packPath: string, sectionId: string): Promise<Claim[]> {
  const path = join(packPath, 'sections', sectionId, 'claims.jsonl');
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: Claim[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    out.push(ClaimSchema.parse(JSON.parse(line)));
  }
  return out;
}

async function writeClaimsJsonl(packPath: string, sectionId: string, claims: Claim[]): Promise<void> {
  const path = join(packPath, 'sections', sectionId, 'claims.jsonl');
  const text = claims.map((c) => JSON.stringify(c)).join('\n') + (claims.length ? '\n' : '');
  await writeFile(path, text, 'utf8');
}

async function readSourceCardsForSection(packPath: string, sectionId: string): Promise<SourceCard[]> {
  const dir = join(packPath, 'evidence', 'source-cards');
  if (!existsSync(dir)) return [];
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir);
  const cards: SourceCard[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const text = await readFile(join(dir, entry), 'utf8');
      const card = SourceCardSchema.parse(JSON.parse(text));
      if (card.section_id === sectionId) cards.push(card);
    } catch {
      // Malformed source card — skip. Repair can still propose using
      // remaining cards or fall through to purpose-only scope.
    }
  }
  return cards;
}

function isFrozenPack(packPath: string): boolean {
  return existsSync(join(packPath, 'audits', 'freeze-receipt.json'));
}

function formatSourceCardSummary(card: SourceCard | undefined): string {
  if (!card) return '(no source card available)';
  const pub = card.publisher ?? '(no publisher)';
  return `${pub} — ${card.source_type} — ${card.title}`;
}

export async function runScopeRepair(options: ScopeRepairOptions): Promise<ScopeRepairResult> {
  const packPath = resolve(options.packPath);
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  if (isFrozenPack(packPath)) throw new FrozenPackError(packPath);
  const sectionDir = join(packPath, 'sections', options.sectionId);
  if (!existsSync(sectionDir)) throw new SectionNotFoundError(options.sectionId);

  if (options.mode === 'interactive' && !options.prompter) {
    throw new PrompterRequiredError();
  }

  const research = await readResearchYaml(packPath);
  const sectionEntry = research.sections.find((s) => s.id === options.sectionId);
  if (!sectionEntry) throw new SectionNotFoundError(options.sectionId);
  const sectionPurpose = sectionEntry.purpose;

  const claims = await readClaimsJsonl(packPath, options.sectionId);
  const sourceCards = await readSourceCardsForSection(packPath, options.sectionId);

  // Candidates: claims with scope === null. The triage stage classifies
  // these into parked_weak_scope (also not=null) and needs_scope_repair
  // (asymmetric). Both populations have scope=null; repair-scope addresses
  // both. We do NOT filter on triage decisions because triage may not have
  // run yet (the v0.1 operator hit the wall pre-triage, hand-editing claims).
  const candidates = claims.filter((c) => c.scope === null);

  const now = (options.now ?? (() => new Date()))();
  // Make timestamps strictly increasing across the loop so the latest-wins
  // helper is deterministic and tests that read the ledger by order get a
  // stable sequence. Using a +i offset keeps the records distinguishable
  // even when the caller's `now()` is constant.
  const baseMs = now.getTime();

  let claimsRepaired = 0;
  let claimsSkipped = 0;
  let quitEarly = false;
  const appliedScopeByClaimId: Record<string, string> = {};
  const mutatedClaims: Claim[] = [...claims];

  for (let i = 0; i < candidates.length; i += 1) {
    const claim = candidates[i]!;
    const claimSourceCards = sourceCards.filter((c) => claim.source_ids.includes(c.source_id));
    const proposal = proposeScopeForClaim({
      claim,
      sectionPurpose,
      sourceCards: claimSourceCards,
    });

    const repairedAt = new Date(baseMs + i).toISOString();
    // R-007: boundary-repair fires only when the claim's `not` is null at
    // repair time. Asymmetric (scope=null, not=set) claims keep their
    // operator-authored boundary; the alignment is targeted, not
    // overwriting.
    const needsNotRepair = claim.not === null;

    let recordToWrite: ScopeRepair;

    if (options.mode === 'auto') {
      const appliedScope = proposal.proposed_scope;
      const appliedNot = needsNotRepair ? proposal.proposed_not : null;
      recordToWrite = ScopeRepairSchema.parse({
        claim_id: claim.claim_id,
        section_id: options.sectionId,
        repaired_at: repairedAt,
        mode: 'auto',
        source_signals: proposal.source_signals,
        proposed_scope: proposal.proposed_scope,
        applied_scope: appliedScope,
        proposed_not: proposal.proposed_not,
        applied_not: appliedNot,
        operator_confirmed: false,
        reason: null,
        operator: options.operator,
        research_os_version: RESEARCH_OS_VERSION,
      });
      const idx = mutatedClaims.findIndex((c) => c.claim_id === claim.claim_id);
      if (idx >= 0) {
        mutatedClaims[idx] = {
          ...mutatedClaims[idx]!,
          scope: appliedScope,
          not: needsNotRepair ? appliedNot : mutatedClaims[idx]!.not,
        };
      }
      appliedScopeByClaimId[claim.claim_id] = appliedScope;
      claimsRepaired += 1;
    } else {
      const prompter = options.prompter!;
      const firstCard = sourceCards.find((c) =>
        claim.source_ids.includes(c.source_id),
      );
      const response = await prompter.promptScopeProposal({
        claim_id: claim.claim_id,
        asserts: claim.asserts,
        section_id: options.sectionId,
        section_purpose: sectionPurpose,
        source_card_summary: formatSourceCardSummary(firstCard),
        proposed_scope: proposal.proposed_scope,
        proposed_not: proposal.proposed_not,
        needs_not_repair: needsNotRepair,
      });

      switch (response.action) {
        case 'accept': {
          const appliedScope = proposal.proposed_scope;
          const appliedNot = needsNotRepair ? proposal.proposed_not : null;
          recordToWrite = ScopeRepairSchema.parse({
            claim_id: claim.claim_id,
            section_id: options.sectionId,
            repaired_at: repairedAt,
            mode: 'interactive',
            source_signals: proposal.source_signals,
            proposed_scope: proposal.proposed_scope,
            applied_scope: appliedScope,
            proposed_not: proposal.proposed_not,
            applied_not: appliedNot,
            operator_confirmed: true,
            reason: null,
            operator: options.operator,
            research_os_version: RESEARCH_OS_VERSION,
          });
          const idx = mutatedClaims.findIndex((c) => c.claim_id === claim.claim_id);
          if (idx >= 0) {
            mutatedClaims[idx] = {
              ...mutatedClaims[idx]!,
              scope: appliedScope,
              not: needsNotRepair ? appliedNot : mutatedClaims[idx]!.not,
            };
          }
          appliedScopeByClaimId[claim.claim_id] = appliedScope;
          claimsRepaired += 1;
          break;
        }
        case 'edit': {
          const newScope = response.new_scope.trim();
          if (newScope.length === 0) {
            throw new Error(
              `Interactive edit returned an empty scope for ${claim.claim_id}; non-empty scope required.`,
            );
          }
          // R-007: when the operator omits new_not but the engine intended
          // to apply a boundary, fall back to proposed_not. Preserves
          // back-compat with v0.10 prompter scripts that only supplied
          // new_scope.
          const editedNotRaw =
            response.new_not !== undefined ? response.new_not.trim() : '';
          const appliedNot = needsNotRepair
            ? editedNotRaw.length > 0
              ? editedNotRaw
              : proposal.proposed_not
            : null;
          recordToWrite = ScopeRepairSchema.parse({
            claim_id: claim.claim_id,
            section_id: options.sectionId,
            repaired_at: repairedAt,
            mode: 'interactive',
            source_signals: proposal.source_signals,
            proposed_scope: proposal.proposed_scope,
            applied_scope: newScope,
            proposed_not: proposal.proposed_not,
            applied_not: appliedNot,
            operator_confirmed: true,
            reason: null,
            operator: options.operator,
            research_os_version: RESEARCH_OS_VERSION,
          });
          const idx = mutatedClaims.findIndex((c) => c.claim_id === claim.claim_id);
          if (idx >= 0) {
            mutatedClaims[idx] = {
              ...mutatedClaims[idx]!,
              scope: newScope,
              not: needsNotRepair ? appliedNot : mutatedClaims[idx]!.not,
            };
          }
          appliedScopeByClaimId[claim.claim_id] = newScope;
          claimsRepaired += 1;
          break;
        }
        case 'skip': {
          recordToWrite = ScopeRepairSchema.parse({
            claim_id: claim.claim_id,
            section_id: options.sectionId,
            repaired_at: repairedAt,
            mode: 'interactive',
            source_signals: proposal.source_signals,
            proposed_scope: proposal.proposed_scope,
            applied_scope: null,
            proposed_not: proposal.proposed_not,
            // Skip leaves both fields unchanged on the claim row. The
            // ledger records the boundary the engine WOULD have proposed
            // for audit, but applied_not is null because no mutation
            // occurred.
            applied_not: null,
            operator_confirmed: false,
            reason: response.reason ?? 'operator skipped',
            operator: options.operator,
            research_os_version: RESEARCH_OS_VERSION,
          });
          claimsSkipped += 1;
          break;
        }
        case 'quit': {
          quitEarly = true;
          break;
        }
      }

      if (response.action === 'quit') break;
    }

    if (recordToWrite!) {
      await appendScopeRepair(packPath, recordToWrite!);
    }
  }

  // Persist mutated claims.jsonl when there is at least one applied scope.
  // (We don't rewrite the file when the only effect was skips — keeps the
  // disk byte-identical when the operator declines every proposal.)
  const anyApplied = Object.keys(appliedScopeByClaimId).length > 0;
  if (anyApplied) {
    await mkdir(sectionDir, { recursive: true });
    await writeClaimsJsonl(packPath, options.sectionId, mutatedClaims);
  }

  return {
    sectionId: options.sectionId,
    claimsConsidered: candidates.length,
    claimsRepaired,
    claimsSkipped,
    quitEarly,
    ledgerPath: scopeRepairsLedgerPath(packPath),
    claimsJsonlPath: join(sectionDir, 'claims.jsonl'),
    appliedScopeByClaimId,
  };
}
