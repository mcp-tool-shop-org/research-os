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

export const ReviewActiveSchema = z.object({
  active_profile: z.string().min(1),
  promoted_at: z.string(),
  promoted_method: z.string(),
  promoted_reviewer: z.string(),
});

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
