// Review profile machinery. Each review run lives under a named profile so
// A/B reviewer experiments don't silently overwrite the section's effective
// review state. The "active" profile (recorded in
// sections/<id>/review-active.json) is the one whose decisions canonical
// consumers see; all other profiles are calibration evidence.
//
// Reads gracefully fall back when no profile machinery is set up — the
// pre-profile dogfood pack continues to work because consumers still read
// from canonical paths.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

export const DEFAULT_PROFILE = 'default';

// A reviewer-calibration snapshot the promoter recorded at the moment they
// chose to trust this profile. Optional but strongly encouraged — gate/
// audit/freeze can use this to explain (not just assert) why the active
// review state is the active review state.
export const PromotionCalibrationSummarySchema = z.object({
  fixture: z.string().nullable().default(null),
  good_false_positive_rate: z.string().nullable().default(null),
  bad_any_flag_recall: z.string().nullable().default(null),
  strict_category_recall: z.string().nullable().default(null),
  unsupported_claim_recall: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});

export const ReviewActiveSchema = z.object({
  active_profile: z.string().min(1),
  promoted_at: z.string(),
  promoted_method: z.string(),
  promoted_reviewer: z.string(),
  // Free-text reason the profile was promoted. Recorded once at promotion
  // time; not derived from artifacts. Required.
  promotion_reason: z.string().min(8).default('promoted via review-promote without an explicit reason'),
  // Optional calibration evidence captured at promotion time so downstream
  // consumers can see WHY the reviewer was trusted.
  calibration_summary: PromotionCalibrationSummarySchema.nullable().default(null),
});

export type PromotionCalibrationSummary = z.infer<typeof PromotionCalibrationSummarySchema>;
export type ReviewActive = z.infer<typeof ReviewActiveSchema>;

export function reviewActivePath(packPath: string, sectionId: string): string {
  return join(packPath, 'sections', sectionId, 'review-active.json');
}

export function profileDir(packPath: string, sectionId: string, profile: string): string {
  return join(packPath, 'sections', sectionId, 'reviews', profile);
}

export async function readActiveProfile(
  packPath: string,
  sectionId: string,
): Promise<string> {
  const path = reviewActivePath(packPath, sectionId);
  if (!existsSync(path)) return DEFAULT_PROFILE;
  try {
    const parsed = ReviewActiveSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    return parsed.active_profile;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function writeActiveProfile(
  packPath: string,
  sectionId: string,
  active: ReviewActive,
): Promise<void> {
  const path = reviewActivePath(packPath, sectionId);
  await mkdir(join(packPath, 'sections', sectionId), { recursive: true });
  await writeFile(path, JSON.stringify(ReviewActiveSchema.parse(active), null, 2), 'utf8');
}

export function isValidProfileName(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(name);
}
