import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';

import { PackNotFoundError, SectionNotFoundError } from '../errors.js';
import { RESEARCH_OS_VERSION } from '../index.js';
import {
  ArchivedArtifactSchema,
  type ArchivedArtifact,
} from './schema.js';
import { z } from 'zod';

// Review-scoped invalidation receipt. Distinct from the extraction
// invalidation receipt because it operates on a different artifact set
// and a different scope (per-section, not pack-wide), but follows the
// same truth-preserving pattern: archive + receipt, never silent delete.

export const ReviewInvalidationReceiptSchema = z.object({
  receipt_id: z.string().regex(/^invr_[0-9]+_[a-z0-9-]+$/),
  section_id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/),
  contract_label: z.string().min(1),
  reason: z.string().min(8),
  invalidated_at: z.string(),
  research_os_version: z.string(),
  archived_artifacts: z.array(ArchivedArtifactSchema),
  notes: z.string().nullable(),
});

export type ReviewInvalidationReceipt = z.infer<typeof ReviewInvalidationReceiptSchema>;

export interface InvalidateReviewOptions {
  packPath?: string;
  sectionId: string;
  reason: string;
  // Folder label under sections/<id>/legacy/. Default: 'pre-review-profiles'.
  label?: string;
  notes?: string;
  now?: () => Date;
}

export interface InvalidateReviewResult {
  performed: boolean;
  receiptId: string | null;
  sectionId: string;
  contractLabel: string;
  archivedCount: number;
  archiveDir: string | null;
  message: string;
}

function posixify(p: string): string {
  return p.split(sep).join('/');
}

async function moveIfExists(
  packPath: string,
  archiveRel: string,
  rel: string,
): Promise<ArchivedArtifact | null> {
  const src = join(packPath, rel);
  if (!existsSync(src)) return null;
  const dst = join(packPath, archiveRel, rel);
  await mkdir(dirname(dst), { recursive: true });
  await rename(src, dst);
  return { src: posixify(rel), dst: posixify(join(archiveRel, rel)) };
}

function buildReceiptMarkdown(receipt: ReviewInvalidationReceipt): string {
  const lines: string[] = [];
  lines.push(`# Review invalidation receipt: ${receipt.section_id}`);
  lines.push('');
  lines.push(`- **Receipt ID:** \`${receipt.receipt_id}\``);
  lines.push(`- **Contract label:** ${receipt.contract_label}`);
  lines.push(`- **Invalidated at:** ${receipt.invalidated_at}`);
  lines.push(`- **research-os version:** ${receipt.research_os_version}`);
  lines.push('');
  lines.push('## Reason');
  lines.push('');
  lines.push(receipt.reason);
  lines.push('');
  if (receipt.notes) {
    lines.push('## Notes');
    lines.push('');
    lines.push(receipt.notes);
    lines.push('');
  }
  lines.push(`## Archived artifacts (${receipt.archived_artifacts.length})`);
  lines.push('');
  if (receipt.archived_artifacts.length === 0) {
    lines.push('_No artifacts found to archive (canonical review state was already empty)._');
  } else {
    lines.push('| From | To |');
    lines.push('|---|---|');
    for (const a of receipt.archived_artifacts) {
      lines.push(`| \`${a.src}\` | \`${a.dst}\` |`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(
    '_The reviewer profile data under `sections/<id>/reviews/<profile>/` is unaffected; this receipt only invalidates canonical (active) review state. Promote a profile via `research-os review-promote` to set new canonical truth._',
  );
  return lines.join('\n');
}

// Archive the canonical review artifacts for a single section. The pre-profile
// dogfood pack accumulated mixed Hermes/Qwen review history before profile
// isolation existed; that ambiguity is itself a truth-seam and must be
// invalidated explicitly, not papered over by the next promote.
export async function invalidateReview(
  options: InvalidateReviewOptions,
): Promise<InvalidateReviewResult> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  if (!existsSync(join(packPath, 'sections', options.sectionId)))
    throw new SectionNotFoundError(options.sectionId);

  const reason = options.reason.trim();
  if (reason.length < 8) {
    throw new Error('invalidation reason must be at least 8 characters');
  }
  const label = (options.label ?? 'pre-review-profiles').trim();
  if (!/^[a-z0-9-]+$/.test(label)) {
    throw new Error('invalidation label must be a kebab-case slug');
  }

  const stamp = (options.now ?? (() => new Date()))();
  const stampMs = stamp.getTime();
  const stampIso = stamp.toISOString();
  const stampPath = stampIso.replace(/[:]/g, '').replace(/\.\d+Z$/, 'Z');
  const archiveRel = posix.join('sections', options.sectionId, 'legacy', label, stampPath);

  // Canonical review artifacts to archive.
  const candidatePaths = [
    posix.join('audits', `${options.sectionId}-review.json`),
    posix.join('audits', `${options.sectionId}-review.md`),
    posix.join('audits', `${options.sectionId}-findings.jsonl`),
    posix.join('sections', options.sectionId, 'claim-reviews.jsonl'),
    // Also clear review-active.json so the next review run is unambiguous.
    posix.join('sections', options.sectionId, 'review-active.json'),
  ];

  // No-op if there's nothing to archive.
  const present = candidatePaths.filter((rel) => existsSync(join(packPath, rel)));
  if (present.length === 0) {
    return {
      performed: false,
      receiptId: null,
      sectionId: options.sectionId,
      contractLabel: label,
      archivedCount: 0,
      archiveDir: null,
      message:
        'No canonical review artifacts found to invalidate. Section has no active review state.',
    };
  }

  await mkdir(join(packPath, archiveRel), { recursive: true });
  const archived: ArchivedArtifact[] = [];
  for (const rel of present) {
    const a = await moveIfExists(packPath, archiveRel, rel);
    if (a) archived.push(a);
  }

  const receipt: ReviewInvalidationReceipt = ReviewInvalidationReceiptSchema.parse({
    receipt_id: `invr_${stampMs}_${options.sectionId}`,
    section_id: options.sectionId,
    contract_label: label,
    reason,
    invalidated_at: stampIso,
    research_os_version: RESEARCH_OS_VERSION,
    archived_artifacts: archived,
    notes: options.notes ?? null,
  });

  const receiptDir = join(packPath, archiveRel);
  await writeFile(
    join(receiptDir, 'invalidation.json'),
    JSON.stringify(receipt, null, 2),
    'utf8',
  );
  await writeFile(
    join(receiptDir, 'invalidation.md'),
    buildReceiptMarkdown(receipt),
    'utf8',
  );

  return {
    performed: true,
    receiptId: receipt.receipt_id,
    sectionId: options.sectionId,
    contractLabel: label,
    archivedCount: archived.length,
    archiveDir: posixify(relative(packPath, receiptDir)),
    message: `Archived ${archived.length} canonical review artifact(s) → ${posixify(relative(packPath, receiptDir))}`,
  };
}
