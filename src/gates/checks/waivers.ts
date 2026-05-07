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

  if (waiver.status !== 'granted') {
    return { updatedResults: updated, waivers_applied: applied, waiver_validation_failures: validationFailures };
  }

  if (!waiver.reason || waiver.reason.trim().length === 0) {
    validationFailures.push({
      family: 'waivers',
      check: 'primary_source_waiver_reason_required',
      status: 'fail',
      detail: `primary_source_waiver.status is "granted" but reason is empty. Waiver is invalid; original failures stand.`,
      evidence: [],
      blocks_synthesis: true,
    });
    return { updatedResults: updated, waivers_applied: applied, waiver_validation_failures: validationFailures };
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
    return { updatedResults: updated, waivers_applied: applied, waiver_validation_failures: validationFailures };
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
    return { updatedResults: updated, waivers_applied: applied, waiver_validation_failures: validationFailures };
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

  return { updatedResults: updated, waivers_applied: applied, waiver_validation_failures: validationFailures };
}
