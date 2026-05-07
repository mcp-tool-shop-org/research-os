import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { PackNotFoundError, SectionNotFoundError } from '../errors.js';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import { ContradictionSchema, type Contradiction } from './schema.js';
import {
  defaultContradictionDetectors,
  pickContradictionDetector,
} from './detectors/index.js';
import { renderMarkdownView } from './markdown.js';
import type {
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
  const adapters = options.detectors ?? defaultContradictionDetectors();
  const detector = await pickContradictionDetector(adapters);

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
