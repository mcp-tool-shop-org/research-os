import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse } from 'yaml';

import { HandoffNotFoundError, PackNotFoundError } from '../errors.js';
import { ResearchYamlSchema, type ResearchYaml } from '../intake/schema.js';
import { ClaimSchema, type Claim } from '../claims/schema.js';
import { ClaimReviewSchema, type ClaimReview } from '../review/schema.js';
import { ContradictionSchema, type Contradiction } from '../contradictions/schema.js';
import { SourceCardSchema, type SourceCard } from '../sources/schema.js';
import { CoworkHandoffPayloadSchema, type CoworkHandoffPayload } from '../cowork/schema.js';

import { deriveCrossSectionMap } from './derive.js';
import { CrossSectionMapSchema } from './schema.js';
import {
  renderCrossSectionMapMarkdown,
  renderDecisionBrief,
  renderFinalReport,
  renderWorkingReport,
} from './markdown.js';
import type { WorkspaceOptions, WorkspaceSummary } from './types.js';

async function readJsonl<T>(path: string, parse: (raw: unknown) => T): Promise<T[]> {
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const out: T[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    out.push(parse(JSON.parse(line)));
  }
  return out;
}

async function readSourceCards(packPath: string): Promise<SourceCard[]> {
  const dir = join(packPath, 'evidence', 'source-cards');
  if (!existsSync(dir)) return [];
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir);
  const cards: SourceCard[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const text = await readFile(join(dir, entry), 'utf8');
    cards.push(SourceCardSchema.parse(JSON.parse(text)));
  }
  return cards;
}

export async function workspace(options: WorkspaceOptions): Promise<WorkspaceSummary> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  const yamlPath = join(packPath, 'research.yaml');
  if (!existsSync(yamlPath)) throw new PackNotFoundError(packPath);
  const research: ResearchYaml = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));

  const handoffPath = join(packPath, 'handoffs', 'cowork-handoff.json');
  if (!existsSync(handoffPath)) throw new HandoffNotFoundError();
  const handoff: CoworkHandoffPayload = CoworkHandoffPayloadSchema.parse(
    JSON.parse(await readFile(handoffPath, 'utf8')),
  );

  if (handoff.mode !== 'synthesis_ready') {
    return {
      packPath,
      mode: handoff.mode,
      refused: true,
      refusalReason: `Synthesis workspace refused: pack is in ${handoff.mode} mode. Run 'research-os cowork handoff' for repair instructions.`,
      filesWritten: [],
      acceptedClaims: handoff.accepted_claim_ids.length,
      claimClusters: 0,
      scopeOverlaps: 0,
      crossSectionContradictions: 0,
    };
  }

  const claimsBySection = new Map<string, Claim[]>();
  const reviewsBySection = new Map<string, ClaimReview[]>();
  const contradictionsBySection = new Map<string, Contradiction[]>();
  for (const section of research.sections) {
    claimsBySection.set(
      section.id,
      await readJsonl<Claim>(join(packPath, 'sections', section.id, 'claims.jsonl'), (r) =>
        ClaimSchema.parse(r),
      ),
    );
    reviewsBySection.set(
      section.id,
      await readJsonl<ClaimReview>(
        join(packPath, 'sections', section.id, 'claim-reviews.jsonl'),
        (r) => ClaimReviewSchema.parse(r),
      ),
    );
    contradictionsBySection.set(
      section.id,
      await readJsonl<Contradiction>(
        join(packPath, 'sections', section.id, 'contradictions.jsonl'),
        (r) => ContradictionSchema.parse(r),
      ),
    );
  }
  const sources = await readSourceCards(packPath);

  const map = CrossSectionMapSchema.parse(
    deriveCrossSectionMap({
      research,
      handoff,
      claimsBySection,
      reviewsBySection,
      contradictionsBySection,
      sources,
      generatedAt: new Date().toISOString(),
    }),
  );

  const synthDir = join(packPath, 'synthesis');
  await mkdir(synthDir, { recursive: true });

  const filesWritten: string[] = [];
  const writeIfAbsent = async (relPath: string, content: string): Promise<void> => {
    const abs = join(synthDir, relPath);
    if (existsSync(abs)) return;
    await writeFile(abs, content, 'utf8');
    filesWritten.push(abs);
  };
  const writeAlways = async (relPath: string, content: string): Promise<void> => {
    const abs = join(synthDir, relPath);
    await writeFile(abs, content, 'utf8');
    filesWritten.push(abs);
  };

  // cross-section-map.* always regenerated (it's derived state)
  await writeAlways('cross-section-map.json', JSON.stringify(map, null, 2));
  await writeAlways('cross-section-map.md', renderCrossSectionMapMarkdown(map));

  // Writable workspaces only created if absent — Cowork's drafts are preserved across re-runs
  await writeIfAbsent('decision-brief.md', renderDecisionBrief(map));
  await writeIfAbsent('working-report.md', renderWorkingReport(map));
  await writeIfAbsent('final-report.md', renderFinalReport(map));

  return {
    packPath,
    mode: handoff.mode,
    refused: false,
    refusalReason: null,
    filesWritten,
    acceptedClaims: map.accepted_claim_ids.length,
    claimClusters: map.claim_clusters.length,
    scopeOverlaps: map.scope_overlaps.length,
    crossSectionContradictions: map.cross_section_contradictions.length,
  };
}
