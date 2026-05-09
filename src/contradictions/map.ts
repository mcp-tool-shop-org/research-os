import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { PackNotFoundError, SectionNotFoundError } from '../errors.js';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import { ContradictionSchema, type Contradiction } from './schema.js';
import {
  pickContradictionDetector,
} from './detectors/index.js';
import { HeuristicContradictionDetector } from './detectors/heuristic.js';
import { OllamaInternContradictionDetector } from './detectors/ollama-intern.js';
import { renderMarkdownView } from './markdown.js';
import type {
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
    const parsed = ClaimSchema.parse(JSON.parse(line));
    if (parsed.review_state !== 'candidate') continue;
    claims.push(parsed);
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
  );
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

async function resolveDetector(options: MapOptions): Promise<{
  detector: ContradictionDetector;
  announcement: string;
}> {
  const mode = options.detectorMode ?? 'auto';

  if (!VALID_DETECTOR_MODES.includes(mode as (typeof VALID_DETECTOR_MODES)[number])) {
    throw new Error(
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
    const d = new OllamaInternContradictionDetector(options.ollamaConfig ?? {});
    if (!(await d.available())) {
      throw new Error(
        `contradict map: ollama-intern detector requested but model ${d.model} is unavailable; aborting (use --detector heuristic to bypass)`,
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
      new OllamaInternContradictionDetector(options.ollamaConfig ?? {}),
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

  const md = renderMarkdownView({
    sectionId: options.sectionId,
    candidateClaims: candidateClaims.length,
    contradictions: existingContradictions,
    detector: detector.name,
    detectionMethod: detectionResult.method,
  });
  await writeFile(mdPath, md, 'utf8');

  return summary;
}
