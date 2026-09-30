# research-os: how it works

Mapped at 2026-09-30 from commit 4bc808e by Atlas 1.24.0.

## What this is

10 parts, mostly TypeScript (420 files), JavaScript (7), CSS (2) and Astro (1). Work enters through 5 doors; CI and Release each reach 2 parts, and CI is followed because a pull request goes through it. It publishes to npm. It deploys a site to GitHub Pages. People run research-os. People import @mcptoolshop/research-os.

## What changed since 2026-09-25 (d888f86)

- CI now also builds src/calibration/aggregate-receipt-schema.ts, src/calibration/aggregate.ts, src/calibration/receipt-schema.ts and 3 more.
- Release now also builds src/calibration/aggregate-receipt-schema.ts, src/calibration/aggregate.ts, src/calibration/receipt-schema.ts and 3 more.
- 1 file added and 1 changed content, across 2 parts.

## What comes in

1. **CI.** On a pull request to main; on a push to main; or by hand. Runs test/audit-aggregate.test.ts, test/audit-run.test.ts, test/calibration-aggregate.test.ts and 215 more; builds src/calibration/aggregate-receipt-schema.ts, src/calibration/aggregate.ts, src/calibration/receipt-schema.ts and 3 more; checks src/.
2. **Release.** When a tag matching `v*.*.*` is pushed; when a release is published; or by hand. Runs test/audit-aggregate.test.ts, test/audit-run.test.ts, test/calibration-aggregate.test.ts and 215 more; builds src/calibration/aggregate-receipt-schema.ts, src/calibration/aggregate.ts, src/calibration/receipt-schema.ts and 3 more; checks src/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **@mcptoolshop/research-os** (the package people import). Loads src/index.ts.
5. **research-os** (a command people run). Runs src/cli.ts.

## What happens through CI

1. The workflow runs 218 files in test; it builds 6 files in src; it checks src/ in src.
2. It uploads coverage to Codecov.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs test/audit-aggregate.test.ts, test/audit-run.test.ts, test/calibration-aggregate.test.ts and 215 more, builds src/calibration/aggregate-receipt-schema.ts, src/calibration/aggregate.ts, src/calibration/receipt-schema.ts and 3 more, checks src/, publishes to npm, and creates a GitHub release on a tag push or by hand.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**@mcptoolshop/research-os** (the package people import) loads src/index.ts.

**research-os** (a command people run) runs src/cli.ts.

## What breaks what

- **src** is imported by 1 part (scripts), and by 1 more only from tests; it sits on the path of 4 doors.
- **test** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **src/cowork/schema.ts** and **src/cowork/types.ts** changed together in 5 of 5 commits, inside the src part.
- **src/audit/aggregate.ts** and **test/audit-aggregate.test.ts** changed together in 5 of 6 commits, and the test part imports the src part.
- **src/cowork/derive.ts** and **src/cowork/schema.ts** changed together in 5 of 6 commits, inside the src part.
- **src/cowork/derive.ts** and **src/cowork/types.ts** changed together in 5 of 6 commits, inside the src part.
- **src/claims/extract.ts** and **src/claims/types.ts** changed together in 9 of 12 commits, inside the src part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 7 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **scripts** is imported by no test.

## Written but never read

- **calibration/reviewer-profiles/** is written by scripts/reviewer-calibration.mjs and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **calibration/reviewer-profiles/** is written by scripts/reviewer-calibration.mjs.

## Hand-authored

People write .github/, docs/, examples/, the repository root, site/ and templates/; 12 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → src/index.ts → src/intake/scaffold.ts → src/intake/schema.ts → src/review/reviewer-options-schema.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 import could not be resolved: `src/indexer/sync.ts` loads `@mcptoolshop/repo-knowledge` when it is installed, which is not declared.
- 12 writes and 7 reads use paths built at run time and are not named here.
- 101 writes and 223 reads go to the directory the command is run in or a path their caller passes, not to this repository.
- 47 writes and 142 reads go to a path their caller passes, not to this repository.
- 2 reads go to the directory the command is run in (README.md), not to this repository.
- 2 commands are built at run time and not followed, 1 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
