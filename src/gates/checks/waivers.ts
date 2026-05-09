import type { SectionScopedWaiver } from '../../intake/schema.js';
import type {
  GateCheckResult,
  GateInput,
  WaiverApplication,
} from '../types.js';

export interface WaiverPassResult {
  updatedResults: GateCheckResult[];
  waivers_applied: WaiverApplication[];
  waiver_validation_failures: GateCheckResult[];
}

export function applyWaivers(
  input: GateInput,
  results: GateCheckResult[],
): WaiverPassResult {
  const waiver = input.research.primary_source_waiver;
  const cfg = input.research.gates.source_floor;
  const updated = results.map((r) => ({ ...r }));
  const applied: WaiverApplication[] = [];
  const validationFailures: GateCheckResult[] = [];

  // Pack-level waiver — existing behavior, unchanged from v0.3.0.
  applyPackLevelWaiver({
    waiver,
    cfg,
    updated,
    applied,
    validationFailures,
  });

  // Section-scoped waivers (v0.3.1+). Each entry is independent: matched by
  // (section_id, scope) and validated for reason + compensating_controls
  // before any source_floor failure is converted. Pack policy
  // primary_source_waiver_allowed: false blocks ALL waivers (pack-level and
  // section-scoped) so an operator cannot smuggle a waiver past pack policy
  // by rerouting it to section scope.
  for (const sw of waiver.section_waivers ?? []) {
    if (sw.section_id !== input.section.id) continue;
    applySectionScopedWaiver({
      waiver: sw,
      cfg,
      updated,
      applied,
      validationFailures,
    });
  }

  return { updatedResults: updated, waivers_applied: applied, waiver_validation_failures: validationFailures };
}

function applyPackLevelWaiver(args: {
  waiver: GateInput['research']['primary_source_waiver'];
  cfg: GateInput['research']['gates']['source_floor'];
  updated: GateCheckResult[];
  applied: WaiverApplication[];
  validationFailures: GateCheckResult[];
}): void {
  const { waiver, cfg, updated, applied, validationFailures } = args;

  if (waiver.status !== 'granted') return;

  if (!waiver.reason || waiver.reason.trim().length === 0) {
    validationFailures.push({
      family: 'waivers',
      check: 'primary_source_waiver_reason_required',
      status: 'fail',
      detail: `primary_source_waiver.status is "granted" but reason is empty. Waiver is invalid; original failures stand.`,
      evidence: [],
      blocks_synthesis: true,
    });
    return;
  }

  if (waiver.compensating_controls.length === 0) {
    validationFailures.push({
      family: 'waivers',
      check: 'primary_source_waiver_compensating_controls_required',
      status: 'fail',
      detail: `primary_source_waiver.status is "granted" but compensating_controls is empty. Waiver is invalid; original failures stand.`,
      evidence: [],
      blocks_synthesis: true,
    });
    return;
  }

  if (!cfg.primary_source_waiver_allowed) {
    validationFailures.push({
      family: 'waivers',
      check: 'primary_source_waiver_allowed_by_pack',
      status: 'fail',
      detail: `Pack policy gates.source_floor.primary_source_waiver_allowed=false; granted waiver cannot be applied.`,
      evidence: [],
      blocks_synthesis: true,
    });
    return;
  }

  // Convert primary_sources_required fail → pass_with_waiver
  for (let i = 0; i < updated.length; i += 1) {
    const r = updated[i]!;
    if (
      r.family === 'source_floor' &&
      r.check === 'primary_sources_required' &&
      r.status === 'fail'
    ) {
      const original = r.status;
      updated[i] = {
        ...r,
        status: 'pass_with_waiver',
        detail: `${r.detail} Waiver granted with ${waiver.compensating_controls.length} compensating control(s); converted from fail to pass_with_waiver.`,
        blocks_synthesis: false,
      };
      applied.push({
        family: 'source_floor',
        check: 'primary_sources_required',
        reason: waiver.reason,
        compensating_controls: waiver.compensating_controls,
        original_status: original,
        new_status: 'pass_with_waiver',
      });
    }
  }
}

function applySectionScopedWaiver(args: {
  waiver: SectionScopedWaiver;
  cfg: GateInput['research']['gates']['source_floor'];
  updated: GateCheckResult[];
  applied: WaiverApplication[];
  validationFailures: GateCheckResult[];
}): void {
  const { waiver, cfg, updated, applied, validationFailures } = args;

  // Schema enforces reason.min(1) and compensating_controls.min(1), but a
  // hand-edited yaml can still parse with whitespace-only reason; check
  // explicitly so the validation surface is consistent with pack-level.
  if (!waiver.reason || waiver.reason.trim().length === 0) {
    validationFailures.push({
      family: 'waivers',
      check: 'section_scoped_waiver_reason_required',
      status: 'fail',
      detail: `Section-scoped waiver for ${waiver.section_id}/${waiver.scope} is missing a reason. Waiver is invalid; original failure stands.`,
      evidence: [waiver.section_id],
      blocks_synthesis: true,
    });
    return;
  }

  if (waiver.compensating_controls.length === 0) {
    validationFailures.push({
      family: 'waivers',
      check: 'section_scoped_waiver_compensating_controls_required',
      status: 'fail',
      detail: `Section-scoped waiver for ${waiver.section_id}/${waiver.scope} has empty compensating_controls. Waiver is invalid; original failure stands.`,
      evidence: [waiver.section_id],
      blocks_synthesis: true,
    });
    return;
  }

  if (!cfg.primary_source_waiver_allowed) {
    validationFailures.push({
      family: 'waivers',
      check: 'section_scoped_waiver_allowed_by_pack',
      status: 'fail',
      detail: `Pack policy gates.source_floor.primary_source_waiver_allowed=false; section-scoped waiver for ${waiver.section_id}/${waiver.scope} cannot be applied.`,
      evidence: [waiver.section_id],
      blocks_synthesis: true,
    });
    return;
  }

  // Convert matching source_floor.<scope> fail → pass_with_waiver
  for (let i = 0; i < updated.length; i += 1) {
    const r = updated[i]!;
    if (
      r.family === 'source_floor' &&
      r.check === waiver.scope &&
      r.status === 'fail'
    ) {
      const original = r.status;
      updated[i] = {
        ...r,
        status: 'pass_with_waiver',
        detail: `${r.detail} Section-scoped waiver granted for ${waiver.section_id} with ${waiver.compensating_controls.length} compensating control(s); converted from fail to pass_with_waiver.`,
        blocks_synthesis: false,
      };
      applied.push({
        family: 'source_floor',
        check: waiver.scope,
        reason: waiver.reason,
        compensating_controls: waiver.compensating_controls,
        original_status: original,
        new_status: 'pass_with_waiver',
      });
    }
  }
}
