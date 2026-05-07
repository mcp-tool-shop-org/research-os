import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

import { PackNotFoundError, SectionNotFoundError } from '../errors.js';
import { ResearchYamlSchema } from '../intake/schema.js';
import {
  DEFAULT_PROFILE,
  isValidProfileName,
  profileDir,
  reviewActivePath,
  writeActiveProfile,
} from './profiles.js';
import { ReviewSnapshotSchema } from './schema.js';
import { renderReviewMarkdown } from './markdown.js';

export interface PromoteOptions {
  sectionId: string;
  packPath?: string;
  profile: string;
  // When true, also bump section status from gated → reviewed if every claim
  // in the promoted profile is accepted_for_synthesis.
  promoteSectionStatus?: boolean;
  now?: () => Date;
}

export interface PromoteResult {
  packPath: string;
  sectionId: string;
  profile: string;
  promoted_at: string;
  promoted_method: string;
  promoted_reviewer: string;
  canonical_files_updated: string[];
  section_status_bumped: boolean;
}

// Promote a review profile: copy its artifacts to the canonical paths
// (audits/<id>-review.{json,md}, audits/<id>-findings.jsonl,
// sections/<id>/claim-reviews.jsonl) and write
// sections/<id>/review-active.json. Until promoted, a profile is
// calibration evidence; after, it is section truth.
export async function promote(options: PromoteOptions): Promise<PromoteResult> {
  const packPath = options.packPath ? resolve(options.packPath) : process.cwd();
  if (!existsSync(join(packPath, 'research.yaml'))) throw new PackNotFoundError(packPath);
  if (!existsSync(join(packPath, 'sections', options.sectionId)))
    throw new SectionNotFoundError(options.sectionId);
  if (!isValidProfileName(options.profile)) {
    throw new Error(
      `Invalid profile name "${options.profile}". Use a kebab/snake-case slug.`,
    );
  }
  const dir = profileDir(packPath, options.sectionId, options.profile);
  const reviewJsonPath = join(dir, 'review.json');
  if (!existsSync(reviewJsonPath)) {
    throw new Error(
      `Profile "${options.profile}" not found at ${dir}. Run \`research-os review --profile ${options.profile}\` first.`,
    );
  }

  // Load the profile's snapshot to discover reviewer/method for the receipt.
  const snapshot = ReviewSnapshotSchema.parse(
    JSON.parse(await readFile(reviewJsonPath, 'utf8')),
  );

  // Copy review.json + review.md to canonical audits/.
  const auditsDir = join(packPath, 'audits');
  await mkdir(auditsDir, { recursive: true });
  const canonicalReviewJson = join(auditsDir, `${options.sectionId}-review.json`);
  const canonicalReviewMd = join(auditsDir, `${options.sectionId}-review.md`);
  await copyFile(reviewJsonPath, canonicalReviewJson);
  await writeFile(canonicalReviewMd, renderReviewMarkdown(snapshot), 'utf8');

  // The findings.jsonl and claim-reviews.jsonl ledgers are append-only on
  // canonical. To make this profile's decisions effective, we re-append
  // every record from the profile so they are the LATEST writes.
  const canonicalFindings = join(auditsDir, `${options.sectionId}-findings.jsonl`);
  const profileFindings = join(dir, 'findings.jsonl');
  const writtenFindings: string[] = [];
  if (existsSync(profileFindings)) {
    const text = await readFile(profileFindings, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      await appendFile(canonicalFindings, line + '\n', 'utf8');
      writtenFindings.push(line);
    }
  }
  const canonicalReviews = join(packPath, 'sections', options.sectionId, 'claim-reviews.jsonl');
  const profileReviews = join(dir, 'claim-reviews.jsonl');
  if (existsSync(profileReviews)) {
    const text = await readFile(profileReviews, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      await appendFile(canonicalReviews, line + '\n', 'utf8');
    }
  }

  // Mark this profile as active.
  const stamp = (options.now ?? (() => new Date()))();
  await writeActiveProfile(packPath, options.sectionId, {
    active_profile: options.profile,
    promoted_at: stamp.toISOString(),
    promoted_method: snapshot.review_method,
    promoted_reviewer: snapshot.reviewer,
  });

  let sectionStatusBumped = false;
  if (options.promoteSectionStatus) {
    const yamlPath = join(packPath, 'research.yaml');
    const research = ResearchYamlSchema.parse(yamlParse(await readFile(yamlPath, 'utf8')));
    const idx = research.sections.findIndex((s) => s.id === options.sectionId);
    if (idx >= 0 && research.sections[idx]!.status === 'gated') {
      const allAccepted =
        snapshot.candidate_claims > 0 &&
        snapshot.claim_reviews.every((r) => r.decision === 'accepted_for_synthesis');
      if (allAccepted) {
        research.sections[idx] = { ...research.sections[idx]!, status: 'reviewed' };
        await writeFile(yamlPath, yamlStringify(research, { lineWidth: 0 }), 'utf8');
        sectionStatusBumped = true;
      }
    }
  }

  return {
    packPath,
    sectionId: options.sectionId,
    profile: options.profile,
    promoted_at: stamp.toISOString(),
    promoted_method: snapshot.review_method,
    promoted_reviewer: snapshot.reviewer,
    canonical_files_updated: [
      canonicalReviewJson,
      canonicalReviewMd,
      canonicalReviews,
      canonicalFindings,
      reviewActivePath(packPath, options.sectionId),
    ],
    section_status_bumped: sectionStatusBumped,
  };
}

// Convenience for callers: `default` is implicitly the active profile when
// review-active.json doesn't exist. Callers can use this to special-case
// pre-profile packs.
export const PROMOTE_DEFAULT_PROFILE = DEFAULT_PROFILE;
