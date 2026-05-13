// Pure classifier for v0.9 Slice 2: decides which sections are includable in
// a partial-pack synthesis and which are excluded with structured reasons.
//
// No LLM calls. No mutation. Reads:
//   - sections/<id>/synthesis/section-synthesis.json (Slice 1 artifact, optional)
//   - sections/<id>/synthesis/section-brief.md       (Slice 1 evidence brief, optional)
//   - handoffs/cowork-handoff.json                    (gate verdict, blocking_reasons)
//   - research.yaml                                   (section purposes + order)
//
// Inclusion rule (ALL must hold):
//   1. section-synthesis.json exists.
//   2. prose.paragraphs has ≥1 entry with verifier_decision === 'faithful'.
//   3. status is 'partial_synthesis' or 'section_synthesis'.
//   4. No proseError populated.
//
// Exclusion reasons (controlled vocabulary, first-match wins):
//   gate_blocked          — gate verdict is 'blocked' or synthesis_eligible=false.
//   unrun                 — section in research.yaml but no claims/handoff entry yet.
//   repair_required       — cowork marks section repair_required without usable prose.
//   prose_error           — section-synthesis.json has proseError populated.
//   no_section_synthesis  — section-brief.md exists but no section-synthesis.json.
//   brief_only            — section-synthesis.json exists but no faithful prose paragraphs.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CoworkHandoffPayload } from '../../cowork/schema.js';
import type { ResearchYaml } from '../../intake/schema.js';

import { SectionSynthesisProsePartSchema } from './schema.js';
import type {
  PartialPackExcludedSection,
  PartialPackIncludedSection,
  PartialPackSectionInput,
} from './types.js';

export interface ClassifyInput {
  packPath: string;
  research: ResearchYaml;
  handoff: CoworkHandoffPayload | null;
}

export interface ClassifyResult {
  included: PartialPackIncludedSection[];
  excluded: PartialPackExcludedSection[];
  // Drafter inputs: same length and order as `included`, with paragraph text.
  drafterInputs: PartialPackSectionInput[];
}

function sectionSynthesisJsonPath(packPath: string, sectionId: string): string {
  return join(packPath, 'sections', sectionId, 'synthesis', 'section-synthesis.json');
}

function sectionBriefPath(packPath: string, sectionId: string): string {
  return join(packPath, 'sections', sectionId, 'synthesis', 'section-brief.md');
}

/**
 * Read and parse a section's section-synthesis.json. Returns null if the file
 * does not exist; throws only on unreadable / malformed input.
 */
async function readSectionSynthesis(
  packPath: string,
  sectionId: string,
): Promise<ReturnType<typeof SectionSynthesisProsePartSchema.parse> | null> {
  const path = sectionSynthesisJsonPath(packPath, sectionId);
  if (!existsSync(path)) return null;
  const raw = await readFile(path, 'utf8');
  return SectionSynthesisProsePartSchema.parse(JSON.parse(raw));
}

function hasFaithfulParagraph(
  prose: NonNullable<ReturnType<typeof SectionSynthesisProsePartSchema.parse>['prose']>,
): boolean {
  return prose.paragraphs.some((p) => p.verifier_decision === 'faithful');
}

function relativeSynthPath(sectionId: string): string {
  return `sections/${sectionId}/synthesis/section-synthesis.json`;
}

/**
 * Classify every section in the pack as included or excluded for partial-pack
 * synthesis. Pure over filesystem state + parsed inputs.
 */
export async function classifySections(input: ClassifyInput): Promise<ClassifyResult> {
  const { packPath, research, handoff } = input;
  const handoffSectionsById = new Map(
    (handoff?.sections ?? []).map((s) => [s.section_id, s]),
  );

  const included: PartialPackIncludedSection[] = [];
  const excluded: PartialPackExcludedSection[] = [];
  const drafterInputs: PartialPackSectionInput[] = [];

  for (const section of research.sections) {
    const sectionId = section.id;
    const purpose = section.purpose;
    const handoffEntry = handoffSectionsById.get(sectionId);

    // 1. gate_blocked: handoff says section is gate-blocked / not eligible.
    //    The verdict 'blocked' is the canonical signal; synthesis_eligible=false
    //    with a gate run is a secondary signal for warn/fail-without-block cases.
    if (handoffEntry) {
      const verdictBlocked = handoffEntry.gate_verdict === 'blocked';
      const eligibleFalse =
        handoffEntry.has_gate_run && handoffEntry.synthesis_eligible === false;
      if (verdictBlocked || eligibleFalse) {
        const detail =
          handoffEntry.blocking_reasons.length > 0
            ? handoffEntry.blocking_reasons.join('; ')
            : 'gate verdict blocked the section without recorded blocking_reasons.';
        excluded.push({
          section_id: sectionId,
          section_purpose: purpose,
          reason: 'gate_blocked',
          detail,
        });
        continue;
      }
    }

    // 2. unrun: section is declared in research.yaml but has no handoff entry
    //    OR the handoff entry shows no gate run AND no review run.
    if (!handoffEntry || (!handoffEntry.has_gate_run && !handoffEntry.has_review_run)) {
      excluded.push({
        section_id: sectionId,
        section_purpose: purpose,
        reason: 'unrun',
        detail: !handoffEntry
          ? 'No cowork handoff entry for this section; section may have been added after the last handoff.'
          : 'Section has no gate run and no review run recorded in the cowork handoff.',
      });
      continue;
    }

    // 3. Inspect section-synthesis.json to distinguish prose_error /
    //    no_section_synthesis / brief_only / included.
    let parsed: Awaited<ReturnType<typeof readSectionSynthesis>>;
    try {
      parsed = await readSectionSynthesis(packPath, sectionId);
    } catch (err) {
      // Malformed JSON or schema mismatch — treat as no_section_synthesis with
      // explanatory detail. The artifact still appears in excluded_sections,
      // not silently dropped.
      excluded.push({
        section_id: sectionId,
        section_purpose: purpose,
        reason: 'no_section_synthesis',
        detail: `section-synthesis.json could not be parsed: ${err instanceof Error ? err.message : 'unknown error'}`,
      });
      continue;
    }

    if (parsed === null) {
      // 4. no_section_synthesis vs unrun is decided by whether section-brief.md
      //    is present. If neither exists, section has no synthesis at all.
      const briefExists = existsSync(sectionBriefPath(packPath, sectionId));
      if (briefExists) {
        excluded.push({
          section_id: sectionId,
          section_purpose: purpose,
          reason: 'no_section_synthesis',
          detail:
            'section-brief.md exists but section-synthesis.json is absent; section synthesis was not run.',
        });
      } else {
        // 5. repair_required vs unrun: handoff has a gate/review run but no
        //    synthesis artifacts at all. Look at the active_blockers list to
        //    decide between repair_required and unrun.
        const handoffBlockers = handoffEntry.active_blockers ?? handoffEntry.blocking_reasons;
        if (handoffBlockers.length > 0) {
          excluded.push({
            section_id: sectionId,
            section_purpose: purpose,
            reason: 'repair_required',
            detail: `Active blockers: ${handoffBlockers.join('; ')}.`,
          });
        } else {
          excluded.push({
            section_id: sectionId,
            section_purpose: purpose,
            reason: 'unrun',
            detail:
              'Section ran gate/review but no section-synthesis.json exists; run `research-os synth section <id>` first.',
          });
        }
      }
      continue;
    }

    // 6. prose_error: section-synthesis.json has proseError populated.
    if (parsed.proseError) {
      const code = parsed.proseError.code;
      const message = parsed.proseError.message;
      excluded.push({
        section_id: sectionId,
        section_purpose: purpose,
        reason: 'prose_error',
        detail: `Prose error (${code}): ${message}`,
      });
      continue;
    }

    // 7. brief_only: section-synthesis.json exists but no prose / no faithful
    //    paragraphs. The evidence brief is the only available artifact.
    if (!parsed.prose || parsed.prose.paragraphs.length === 0) {
      excluded.push({
        section_id: sectionId,
        section_purpose: purpose,
        reason: 'brief_only',
        detail:
          'section-synthesis.json has no prose paragraphs; only the section-brief evidence index is available.',
      });
      continue;
    }
    if (!hasFaithfulParagraph(parsed.prose)) {
      excluded.push({
        section_id: sectionId,
        section_purpose: purpose,
        reason: 'brief_only',
        detail:
          'section-synthesis.json has prose paragraphs but none passed verification (verifier_decision !== faithful).',
      });
      continue;
    }

    // 8. INCLUDED.
    const faithfulParagraphs = parsed.prose.paragraphs.filter(
      (p) => p.verifier_decision === 'faithful',
    );

    const path = relativeSynthPath(sectionId);
    included.push({
      section_id: sectionId,
      section_purpose: purpose,
      section_synthesis_path: path,
      paragraph_count: faithfulParagraphs.length,
    });
    drafterInputs.push({
      section_id: sectionId,
      section_purpose: purpose,
      section_synthesis_path: path,
      paragraphs: faithfulParagraphs.map((p) => ({
        section_paragraph_id: `${sectionId}:${p.paragraph_id}`,
        role: p.role,
        text: p.text,
        verifier_decision: p.verifier_decision,
      })),
    });
  }

  return { included, excluded, drafterInputs };
}
