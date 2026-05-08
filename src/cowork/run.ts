import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { PackNotFoundError } from '../errors.js';
import { ResearchYamlSchema, type ResearchYaml } from '../intake/schema.js';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import { ContradictionSchema, type Contradiction } from '../contradictions/schema.js';
import { ContradictionResolutionSchema, type ContradictionResolution } from '../contradictions/resolution-schema.js';
import { SectionGateResultSchema, type SectionGateResult } from '../gates/schema.js';
import { ClaimReviewSchema, type ClaimReview } from '../review/schema.js';
import { indexDbPath } from '../indexer/db.js';

import { derive, type DeriveInput } from './derive.js';
import { CoworkHandoffPayloadSchema } from './schema.js';
import { renderCoworkMaster } from './markdown.js';
import type { HandoffOptions, HandoffSummary } from './types.js';

async function loadResearchYaml(packPath: string): Promise<ResearchYaml> {
  const yamlPath = join(packPath, 'research.yaml');
  if (!existsSync(yamlPath)) throw new PackNotFoundError(packPath);
  const text = await readFile(yamlPath, 'utf8');
  return ResearchYamlSchema.parse(yamlParse(text));
}

async function readJsonl<T>(
  path: string,
  parse: (raw: unknown) => T,
  warnings: string[],
): Promise<T[]> {
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(parse(JSON.parse(line)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'parse error';
      warnings.push(`malformed line in ${path}: ${msg}`);
    }
  }
  return out;
}

async function readGate(
  packPath: string,
  sectionId: string,
  warnings: string[],
): Promise<SectionGateResult | null> {
  const path = join(packPath, 'audits', `${sectionId}-gate.json`);
  if (!existsSync(path)) return null;
  try {
    const text = await readFile(path, 'utf8');
    return SectionGateResultSchema.parse(JSON.parse(text));
  } catch (err) {
    warnings.push(`malformed gate result at audits/${sectionId}-gate.json: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export async function handoff(options: HandoffOptions): Promise<HandoffSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  const research = await loadResearchYaml(packPath);
  const warnings: string[] = [];

  const perSection: DeriveInput['perSection'] = new Map();
  for (const section of research.sections) {
    const sid = section.id;
    const claims = await readJsonl<Claim>(
      join(packPath, 'sections', sid, 'claims.jsonl'),
      (r) => ClaimSchema.parse(r),
      warnings,
    );
    const candidateClaims = claims.filter((c) => c.review_state === 'candidate');
    const claimReviews = await readJsonl<ClaimReview>(
      join(packPath, 'sections', sid, 'claim-reviews.jsonl'),
      (r) => ClaimReviewSchema.parse(r),
      warnings,
    );
    const contradictions = await readJsonl<Contradiction>(
      join(packPath, 'sections', sid, 'contradictions.jsonl'),
      (r) => ContradictionSchema.parse(r),
      warnings,
    );
    const resolutions = await readJsonl<ContradictionResolution>(
      join(packPath, 'sections', sid, 'contradiction-resolutions.jsonl'),
      (r) => ContradictionResolutionSchema.parse(r),
      warnings,
    );
    const gate = await readGate(packPath, sid, warnings);
    perSection.set(sid, { gate, candidateClaims, claimReviews, contradictions, resolutions });
  }

  const indexExists = existsSync(indexDbPath(packPath));
  if (!indexExists) {
    warnings.push(
      'Pack-local index missing at .research-os/index.sqlite — Cowork can still operate from canonical artifacts, but `research-os query` will refuse until you run `research-os index build --all`.',
    );
  }

  const generatedAt = new Date().toISOString();
  const payload = CoworkHandoffPayloadSchema.parse(
    derive({
      research,
      perSection,
      indexStatus: indexExists ? 'present' : 'missing',
      generatedAt,
      warnings,
    }),
  );

  const handoffsDir = join(packPath, 'handoffs');
  await mkdir(handoffsDir, { recursive: true });
  const jsonPath = join(handoffsDir, 'cowork-handoff.json');
  const mdPath = join(handoffsDir, 'cowork-master.md');
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  await writeFile(mdPath, renderCoworkMaster(payload), 'utf8');

  return {
    packId: payload.pack_id,
    packTopic: payload.pack_topic,
    mode: payload.mode,
    synthesisAllowed: payload.synthesis_allowed,
    jsonPath,
    markdownPath: mdPath,
    warnings,
    acceptedCount: payload.accepted_claim_ids.length,
    repairCount: payload.repair_claim_ids.length,
    blockedCount: payload.blocked_claim_ids.length,
  };
}
