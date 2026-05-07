import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

import { PackNotFoundError } from '../errors.js';
import { ResearchYamlSchema, type ResearchYaml } from '../intake/schema.js';
import { RESEARCH_OS_VERSION } from '../index.js';
import {
  InvalidationReceiptSchema,
  type ArchivedArtifact,
  type InvalidationReceipt,
  type SectionStatusChange,
} from './schema.js';
import type {
  InvalidateExtractionOptions,
  InvalidateExtractionResult,
} from './types.js';

// Make all stored paths POSIX-style for cross-platform receipt portability.
function posixify(p: string): string {
  return p.split(sep).join('/');
}

// A claim authored under the legacy contract has either no
// evidence_excerpt_ids field at all, or an empty array. Span-first writes
// always populate >= 1.
function isLegacyClaimLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  try {
    const obj = JSON.parse(trimmed) as { evidence_excerpt_ids?: unknown };
    if (obj.evidence_excerpt_ids === undefined) return true;
    if (!Array.isArray(obj.evidence_excerpt_ids)) return true;
    return obj.evidence_excerpt_ids.length === 0;
  } catch {
    return false;
  }
}

async function detectLegacyClaimSections(packPath: string): Promise<string[]> {
  const sectionsDir = join(packPath, 'sections');
  if (!existsSync(sectionsDir)) return [];
  const entries = await readdir(sectionsDir, { withFileTypes: true });
  const affected: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const claimsPath = join(sectionsDir, entry.name, 'claims.jsonl');
    if (!existsSync(claimsPath)) continue;
    const text = await readFile(claimsPath, 'utf8');
    let hasLegacy = false;
    for (const line of text.split(/\r?\n/)) {
      if (isLegacyClaimLine(line)) {
        hasLegacy = true;
        break;
      }
    }
    if (hasLegacy) affected.push(entry.name);
  }
  return affected.sort();
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

async function moveDirContentsIfExists(
  packPath: string,
  archiveRel: string,
  relDir: string,
  // Skip any path under the new archive itself so we never archive into ourselves.
  // skipPrefix is POSIX-style (forward slashes); we compare against POSIX form
  // of relative paths to keep behaviour identical across Windows and POSIX.
  skipPrefix: string,
): Promise<ArchivedArtifact[]> {
  const fullDir = join(packPath, relDir);
  if (!existsSync(fullDir)) return [];
  const entries = await readdir(fullDir, { withFileTypes: true });
  const moved: ArchivedArtifact[] = [];
  for (const entry of entries) {
    // Always join in POSIX form for stable cross-platform comparisons.
    const childRelPosix = posix.join(posixify(relDir), entry.name);
    if (childRelPosix === skipPrefix || childRelPosix.startsWith(skipPrefix + '/')) continue;
    if (entry.isDirectory()) {
      moved.push(
        ...(await moveDirContentsIfExists(packPath, archiveRel, childRelPosix, skipPrefix)),
      );
    } else if (entry.isFile()) {
      const m = await moveIfExists(packPath, archiveRel, childRelPosix);
      if (m) moved.push(m);
    }
  }
  return moved;
}

function buildReceiptMarkdown(receipt: InvalidationReceipt): string {
  const lines: string[] = [];
  lines.push(`# Invalidation receipt: ${receipt.contract_label}`);
  lines.push('');
  lines.push(`- **Receipt ID:** \`${receipt.receipt_id}\``);
  lines.push(`- **Invalidated at:** ${receipt.invalidated_at}`);
  lines.push(`- **research-os version:** ${receipt.research_os_version}`);
  lines.push(`- **New contract:** ${receipt.new_contract}`);
  if (receipt.superseded_contract) {
    lines.push(`- **Superseded contract:** ${receipt.superseded_contract}`);
  }
  lines.push(`- **frozen_at cleared:** ${receipt.frozen_at_cleared ? 'yes' : 'no'}`);
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
  lines.push(`## Affected sections (${receipt.affected_sections.length})`);
  lines.push('');
  if (receipt.affected_sections.length === 0) {
    lines.push('_None at the section level — only pack-level downstream artifacts were archived._');
  } else {
    for (const id of receipt.affected_sections) lines.push(`- \`${id}\``);
  }
  lines.push('');
  lines.push(`## Section status changes (${receipt.section_status_changes.length})`);
  lines.push('');
  if (receipt.section_status_changes.length === 0) {
    lines.push('_No section status changes._');
  } else {
    lines.push('| Section | Before | After |');
    lines.push('|---|---|---|');
    for (const c of receipt.section_status_changes) {
      lines.push(`| \`${c.section_id}\` | ${c.before} | ${c.after} |`);
    }
  }
  lines.push('');
  lines.push(`## Archived artifacts (${receipt.archived_artifacts.length})`);
  lines.push('');
  if (receipt.archived_artifacts.length === 0) {
    lines.push('_No artifacts archived._');
  } else {
    lines.push('Each row shows where the artifact was, and where it lives now.');
    lines.push('');
    lines.push('| From | To |');
    lines.push('|---|---|');
    for (const a of receipt.archived_artifacts) {
      lines.push(`| \`${a.src}\` | \`${a.dst}\` |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export async function invalidateExtraction(
  options: InvalidateExtractionOptions,
): Promise<InvalidateExtractionResult> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  const yamlPath = join(packPath, 'research.yaml');
  if (!existsSync(yamlPath)) throw new PackNotFoundError(packPath);

  const reason = options.reason.trim();
  if (reason.length < 8) {
    throw new Error('invalidation reason must be at least 8 characters');
  }

  const label = (options.label ?? 'pre-span-extraction').trim();
  if (!/^[a-z0-9-]+$/.test(label)) {
    throw new Error('invalidation label must be a kebab-case slug');
  }
  const newContract = options.newContract ?? 'span-first-extraction';
  const supersededContract = options.supersededContract ?? 'authored-evidence-excerpt';

  const now = options.now ?? (() => new Date());
  const stamp = now();
  const stampMs = stamp.getTime();
  const stampIso = stamp.toISOString();
  // Folder-friendly ISO without colons.
  const stampPath = stampIso.replace(/[:]/g, '').replace(/\.\d+Z$/, 'Z');
  const archiveRel = posix.join('audits', 'legacy', label, stampPath);

  const affectedSections = await detectLegacyClaimSections(packPath);

  const research = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));

  // Pack-level downstream artifacts that depend on extraction truth. Even if
  // only one section's claims are legacy, these aggregate over all sections
  // and reflect a state that no longer exists. Re-run audit/handoff/synth
  // after invalidation to rebuild them.
  const packLevelDirs = ['handoffs', 'synthesis', 'audits'];

  // If no affected sections AND no pack-level artifacts to archive, nothing
  // to do — return idempotent no-op.
  let probeArtifactsExist = affectedSections.length > 0;
  if (!probeArtifactsExist) {
    for (const d of packLevelDirs) {
      const full = join(packPath, d);
      if (!existsSync(full)) continue;
      // For audits/, a pre-existing legacy/ tree alone shouldn't trigger.
      const entries = await readdir(full, { withFileTypes: true });
      const meaningful = entries.some(
        (e) => !(d === 'audits' && e.isDirectory() && e.name === 'legacy'),
      );
      if (meaningful) {
        probeArtifactsExist = true;
        break;
      }
    }
  }

  if (!probeArtifactsExist) {
    return {
      performed: false,
      receiptId: null,
      contractLabel: label,
      affectedSections: [],
      archivedCount: 0,
      archiveDir: null,
      message: 'No legacy artifacts found. Pack is on the current extraction contract.',
    };
  }

  // Make the archive root early so moveIfExists has a stable target.
  await mkdir(join(packPath, archiveRel), { recursive: true });

  const archived: ArchivedArtifact[] = [];

  // Per-section files for affected sections.
  for (const sectionId of affectedSections) {
    for (const filename of [
      'claims.jsonl',
      'claim-reviews.jsonl',
      'findings.jsonl',
      'contradictions.jsonl',
      'contradictions.md',
      'claims.md',
    ]) {
      const rel = posix.join('sections', sectionId, filename);
      const a = await moveIfExists(packPath, archiveRel, rel);
      if (a) archived.push(a);
    }
  }

  // Pack-level downstream artifacts. Skip the archive's own subtree so we
  // don't try to archive ourselves.
  const skipPrefix = posix.join('audits', 'legacy');
  for (const d of packLevelDirs) {
    archived.push(...(await moveDirContentsIfExists(packPath, archiveRel, d, skipPrefix)));
  }

  // Reset section statuses for affected sections; remember the original.
  const statusChanges: SectionStatusChange[] = [];
  const affectedSet = new Set(affectedSections);
  const updatedSections = research.sections.map((s) => {
    if (!affectedSet.has(s.id)) return s;
    if (s.status === 'draft') return s;
    statusChanges.push({ section_id: s.id, before: s.status, after: 'draft' });
    return { ...s, status: 'draft' as const };
  });
  const frozenAtCleared = research.frozen_at !== null;
  const updated: ResearchYaml = {
    ...research,
    sections: updatedSections,
    frozen_at: null,
  };
  await writeFile(yamlPath, yamlStringify(updated, { lineWidth: 0 }), 'utf8');

  const receipt: InvalidationReceipt = InvalidationReceiptSchema.parse({
    receipt_id: `inv_${stampMs}_${label}`,
    contract_label: label,
    superseded_contract: supersededContract,
    new_contract: newContract,
    reason,
    invalidated_at: stampIso,
    research_os_version: RESEARCH_OS_VERSION,
    affected_sections: affectedSections,
    archived_artifacts: archived,
    section_status_changes: statusChanges,
    frozen_at_cleared: frozenAtCleared,
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

  const archiveDirRel = posixify(relative(packPath, receiptDir));
  return {
    performed: true,
    receiptId: receipt.receipt_id,
    contractLabel: label,
    affectedSections,
    archivedCount: archived.length,
    archiveDir: archiveDirRel,
    message: `Archived ${archived.length} artifact(s) across ${affectedSections.length} affected section(s) → ${archiveDirRel}`,
  };
}
