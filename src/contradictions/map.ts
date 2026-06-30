import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { PackNotFoundError, ResearchOSError, SectionNotFoundError } from '../errors.js';
import { InvalidArgumentError } from 'commander';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import { ContradictionSchema, type Contradiction } from './schema.js';
import {
  pickContradictionDetector,
} from './detectors/index.js';
import { HeuristicContradictionDetector } from './detectors/heuristic.js';
import { OllamaInternContradictionDetector } from './detectors/ollama-intern.js';
import { renderMarkdownView } from './markdown.js';
import { emitProgress } from '../util/progress.js';
import type {
  AutoModeFallThroughInfo,
  ContradictionDetector,
  ContradictionDetectorName,
  MapOptions,
  MapSummary,
  PairedDraft,
} from './types.js';

const DETECTOR_ID_PART: Record<ContradictionDetectorName, string> = {
  heuristic: 'heuristic',
  'ollama-intern': 'ollama_intern',
};

async function readCandidateClaims(packPath: string, sectionId: string): Promise<Claim[]> {
  const path = join(packPath, 'sections', sectionId, 'claims.jsonl');
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const claims: Claim[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = ClaimSchema.parse(JSON.parse(line));
      if (parsed.review_state !== 'candidate') continue;
      claims.push(parsed);
    } catch {
      /* skip malformed line — matches sibling pattern in triage/run.ts and density/run.ts */
    }
  }
  return claims;
}

async function readExistingContradictions(
  packPath: string,
  sectionId: string,
): Promise<Contradiction[]> {
  const path = join(packPath, 'sections', sectionId, 'contradictions.jsonl');
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const list: Contradiction[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      list.push(ContradictionSchema.parse(JSON.parse(line)));
    } catch {
      /* skip malformed */
    }
  }
  return list;
}

function pairHash(claimAId: string, claimBId: string): string {
  const sorted = [claimAId, claimBId].sort();
  return createHash('sha256')
    .update(sorted.join('|'))
    .digest('hex')
    .slice(0, 12);
}

function buildContradiction(args: {
  paired: PairedDraft;
  sectionId: string;
  detector: ContradictionDetectorName;
  detectionMethod: string;
}): Contradiction {
  const { paired, sectionId, detector, detectionMethod } = args;
  const { claim_a, claim_b, draft } = paired;
  const detectorIdPart = DETECTOR_ID_PART[detector];
  const id = `cnt_${pairHash(claim_a.claim_id, claim_b.claim_id)}_${detectorIdPart}`;
  const sourceIds = Array.from(
    new Set<string>([...claim_a.source_ids, ...claim_b.source_ids]),
  ).sort();
  return ContradictionSchema.parse({
    contradiction_id: id,
    section_id: sectionId,
    claim_ids: [claim_a.claim_id, claim_b.claim_id].sort(),
    source_ids: sourceIds,
    type: draft.type,
    summary: draft.summary,
    scope_analysis: draft.scope_analysis,
    overlap_assessment: draft.overlap_assessment,
    severity: draft.severity,
    confidence: draft.confidence,
    detector,
    detection_method: detectionMethod,
    evidence: draft.evidence,
    status: 'unresolved',
    created_at: new Date().toISOString(),
  });
}

const VALID_DETECTOR_MODES = ['auto', 'heuristic', 'ollama-intern'] as const;

// R-021 — assemble the OllamaContradictionConfig with the auto-mode-specific
// timeout + fall-through threshold from MapOptions threaded in.
//
// Backward-compat: when `options.autoModePairTimeoutMs` is undefined, the
// detector falls back to `ollamaConfig.timeoutMs` if set, else its built-in
// default (DEFAULT_AUTO_MODE_PAIR_TIMEOUT_MS). The same is true for
// fallThroughAfterN.
function buildOllamaConfig(options: MapOptions): {
  host?: string;
  model?: string;
  timeoutMs?: number;
  fallThroughAfterN?: number;
  fetchImpl?: typeof fetch;
} {
  const base = options.ollamaConfig ?? {};
  return {
    ...base,
    timeoutMs: options.autoModePairTimeoutMs ?? base.timeoutMs,
    fallThroughAfterN: options.autoModeFallThroughAfterNTimeouts,
  };
}

async function resolveDetector(options: MapOptions): Promise<{
  detector: ContradictionDetector;
  announcement: string;
}> {
  const mode = options.detectorMode ?? 'auto';

  // C1-011: detector-mode validation — InvalidArgumentError flows through
  // commander's usage-error handling (consistent with parseIntArg / D-008).
  if (!VALID_DETECTOR_MODES.includes(mode as (typeof VALID_DETECTOR_MODES)[number])) {
    throw new InvalidArgumentError(
      `contradict map: invalid --detector value "${mode}"; valid values are: auto, heuristic, ollama-intern`,
    );
  }

  if (mode === 'heuristic') {
    return {
      detector: new HeuristicContradictionDetector(),
      announcement: 'contradict map: using heuristic detector',
    };
  }

  if (mode === 'ollama-intern') {
    const d = new OllamaInternContradictionDetector(buildOllamaConfig(options));
    if (!(await d.available())) {
      // C1-011: ollama-intern not running is a state failure (not a CLI
      // arg validation failure). Closest existing code is INTAKE_VALIDATION
      // ("admission to the detector path failed"). See escalation note:
      // a dedicated DETECTOR_UNAVAILABLE / OLLAMA_UNAVAILABLE code would
      // be more precise.
      throw new ResearchOSError(
        `contradict map: ollama-intern detector requested but model ${d.model} is unavailable; aborting.`,
        'INTAKE_VALIDATION',
        `Start the Ollama daemon and pull the model (\`ollama pull ${d.model}\`), or fall back with --detector heuristic. See handbook/known-limitations.md.`,
      );
    }
    return {
      detector: d,
      announcement: `contradict map: using ollama-intern detector with model ${d.model}`,
    };
  }

  // auto mode — preserve existing env-var-driven behavior; announce which path ran
  const detectors =
    options.detectors ??
    [
      new OllamaInternContradictionDetector(buildOllamaConfig(options)),
      new HeuristicContradictionDetector(),
    ];
  const detector = await pickContradictionDetector(detectors);

  if (detector.name === 'ollama-intern') {
    const modelName =
      detector instanceof OllamaInternContradictionDetector
        ? detector.model
        : (process.env.OLLAMA_INTERN_MODEL ?? 'hermes3:8b');
    return {
      detector,
      announcement: `contradict map: using ollama-intern detector with model ${modelName}`,
    };
  }

  return {
    detector,
    announcement: 'contradict map: ollama-intern unavailable; using heuristic detector',
  };
}

export async function map(options: MapOptions): Promise<MapSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  const sectionDir = join(packPath, 'sections', options.sectionId);
  if (!existsSync(sectionDir)) throw new SectionNotFoundError(options.sectionId);

  let candidateClaims = await readCandidateClaims(packPath, options.sectionId);
  if (options.triagedOnly) {
    const { readTriagedClaimIds } = await import('../triage/run.js');
    const allowed = await readTriagedClaimIds(packPath, options.sectionId);
    candidateClaims = candidateClaims.filter((c) => allowed.has(c.claim_id));
  }
  const { detector, announcement } = await resolveDetector(options);

  const summary: MapSummary = {
    sectionId: options.sectionId,
    detector: detector.name,
    detectionMethod: '',
    candidateClaims: candidateClaims.length,
    pairsCompared: 0,
    contradictionsAdded: 0,
    contradictionsDeduped: 0,
    contradictionIds: [],
    detectorError: null,
    detectorAnnouncement: announcement,
  };

  const ledgerPath = join(sectionDir, 'contradictions.jsonl');
  const mdPath = join(sectionDir, 'contradictions.md');

  const existingContradictions = await readExistingContradictions(
    packPath,
    options.sectionId,
  );
  const existingIds = new Set(existingContradictions.map((c) => c.contradiction_id));

  if (candidateClaims.length < 2) {
    summary.detectionMethod = 'no_pairs';
    const md = renderMarkdownView({
      sectionId: options.sectionId,
      candidateClaims: candidateClaims.length,
      contradictions: existingContradictions,
      detector: detector.name,
      detectionMethod: 'no_pairs',
    });
    await writeFile(mdPath, md, 'utf8');
    return summary;
  }

  const detectionResult = await detector.detect(candidateClaims);
  if (!detectionResult.ok) {
    summary.detectorError = detectionResult.error;
    summary.detectionMethod = 'failed';
    const md = renderMarkdownView({
      sectionId: options.sectionId,
      candidateClaims: candidateClaims.length,
      contradictions: existingContradictions,
      detector: detector.name,
      detectionMethod: 'failed',
    });
    await writeFile(mdPath, md, 'utf8');
    return summary;
  }

  summary.detectionMethod = detectionResult.method;
  summary.pairsCompared = (candidateClaims.length * (candidateClaims.length - 1)) / 2;

  // R-021 — write LLM detector's drafts first (so the per-contradiction
  // detector field reflects the actual classifier that produced each entry).
  for (const paired of detectionResult.drafts) {
    const c = buildContradiction({
      paired,
      sectionId: options.sectionId,
      detector: detector.name,
      detectionMethod: detectionResult.method,
    });
    if (existingIds.has(c.contradiction_id)) {
      summary.contradictionsDeduped += 1;
      continue;
    }
    await appendFile(ledgerPath, JSON.stringify(c) + '\n', 'utf8');
    existingIds.add(c.contradiction_id);
    existingContradictions.push(c);
    summary.contradictionsAdded += 1;
    summary.contradictionIds.push(c.contradiction_id);
  }

  // R-021 — if the LLM detector engaged fall-through, run the heuristic on
  // ONLY the unprocessed pairs. The heuristic detector exposes a
  // `detectSpecificPairs` method for exactly this case. Contradictions
  // produced here carry detector='heuristic' and a distinct contradiction_id
  // suffix (DETECTOR_ID_PART), so they cannot duplicate any LLM-produced
  // entry on a different pair.
  let autoModeFallThrough: AutoModeFallThroughInfo | undefined;
  // B-CNT-002: run the full-space heuristic backfill whenever the LLM detector
  // EITHER fell through OR dropped scattered per-pair failures that never
  // triggered fall-through. In both cases some pairs were classified by neither
  // detector; the backfill below already covers the FULL unclassified pair space
  // (A-CNT-001), so it closes both gaps with the same machinery. Clean runs
  // (no fall-through, pairsFailed=0) skip this block entirely → byte-identical.
  const fellThrough = !!(detectionResult.fallThrough && detectionResult.unprocessedPairs);
  const detectionPairsFailed = detectionResult.pairsFailed ?? 0;
  if (fellThrough || detectionPairsFailed > 0) {
    // A-CNT-001: the LLM detector's `unprocessedPairs` is the LLM prefilter's
    // OWN subset — pairs the prefilter scored >= its 0.25 threshold but did not
    // get to classify before fall-through. Running the heuristic over ONLY that
    // subset leaves pairs that fell BELOW the prefilter's 0.25 threshold (yet
    // are >= the heuristic's 0.4-0.5 thresholds) classified by NEITHER detector.
    // To match `--detector heuristic` coverage, run the heuristic over the FULL
    // pair space the LLM did not classify into a contradiction: every i<j minus
    // the pairs the LLM already produced a draft for. Heuristic contradictions
    // carry detector='heuristic' + a distinct contradiction_id suffix, so they
    // cannot duplicate any LLM-produced entry.
    const llmClassifiedPairKeys = new Set<string>();
    for (const paired of detectionResult.drafts) {
      const aIdx = candidateClaims.indexOf(paired.claim_a);
      const bIdx = candidateClaims.indexOf(paired.claim_b);
      if (aIdx < 0 || bIdx < 0) continue;
      const [lo, hi] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
      llmClassifiedPairKeys.add(`${lo},${hi}`);
    }
    const fullUnprocessedPairs: Array<[number, number]> = [];
    for (let i = 0; i < candidateClaims.length; i += 1) {
      for (let j = i + 1; j < candidateClaims.length; j += 1) {
        if (llmClassifiedPairKeys.has(`${i},${j}`)) continue;
        fullUnprocessedPairs.push([i, j]);
      }
    }

    const heuristic = new HeuristicContradictionDetector();
    const heuristicResult = await heuristic.detectSpecificPairs(
      candidateClaims,
      fullUnprocessedPairs,
    );

    if (heuristicResult.ok) {
      for (const paired of heuristicResult.drafts) {
        const c = buildContradiction({
          paired,
          sectionId: options.sectionId,
          detector: 'heuristic',
          detectionMethod: heuristicResult.method,
        });
        if (existingIds.has(c.contradiction_id)) {
          summary.contradictionsDeduped += 1;
          continue;
        }
        await appendFile(ledgerPath, JSON.stringify(c) + '\n', 'utf8');
        existingIds.add(c.contradiction_id);
        existingContradictions.push(c);
        summary.contradictionsAdded += 1;
        summary.contradictionIds.push(c.contradiction_id);
      }
    }

    if (fellThrough && detectionResult.fallThrough) {
      // Compose the summary fall-through info. autoClassifiedPairs =
      // triggeredAtPairIndex (1-based pair index at which the Nth timeout
      // fired; equivalent to "the LLM attempted this many pairs before
      // bailing"). heuristicClassifiedPairs = unprocessedPairs.length.
      autoModeFallThrough = {
        triggeredAtPairIndex: detectionResult.fallThrough.triggeredAtPairIndex,
        consecutiveTimeouts: detectionResult.fallThrough.consecutiveTimeouts,
        perPairTimeoutMs: detectionResult.fallThrough.perPairTimeoutMs,
        reason: 'consecutive_timeouts',
        remainingPairsHandledBy: 'heuristic',
        autoClassifiedPairs: detectionResult.fallThrough.triggeredAtPairIndex,
        // A-CNT-001: heuristic now covers the FULL unclassified pair space, not
        // just the LLM prefilter's subset — report the actual pair count it ran on.
        heuristicClassifiedPairs: fullUnprocessedPairs.length,
      };
      summary.autoModeFallThrough = autoModeFallThrough;
    } else {
      // B-CNT-002: scattered per-pair failures that never tripped fall-through.
      // The heuristic backfill above already covered the unclassified pairs;
      // surface the otherwise-silent partial coverage durably (MapSummary) AND
      // with a forced stderr line (un-gated, like the fall-through trigger) so a
      // non-TTY / --no-progress operator still learns the LLM dropped pairs.
      summary.autoModePairsFailed = detectionPairsFailed;
      emitProgress(
        `auto-mode: ${detectionPairsFailed} pair(s) failed LLM classification (scattered, no fall-through); ` +
          `the heuristic detector backfilled the unclassified pairs`,
        { forceProgress: true },
      );
    }
  }

  const md = renderMarkdownView({
    sectionId: options.sectionId,
    candidateClaims: candidateClaims.length,
    contradictions: existingContradictions,
    detector: detector.name,
    detectionMethod: detectionResult.method,
    autoModeFallThrough,
  });
  await writeFile(mdPath, md, 'utf8');

  return summary;
}
