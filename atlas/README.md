# research-os: how it works

Mapped at 2026-09-25 from commit d888f86.

## What this is

10 parts, mostly TypeScript (420 files) and JavaScript (7). Work enters through 5 doors; CI and Release each reach 2 parts, and CI is followed because a pull request goes through it. It publishes to npm. People run research-os. People import @mcptoolshop/research-os.

## What changed since the last map

This is the first map.

## What comes in

1. **CI.** On a pull request; on a push to main; or by hand. Runs test/audit-aggregate.test.ts, test/audit-run.test.ts, test/calibration-aggregate.test.ts and 215 more; checks src/.
2. **Release.** When a tag matching `v*.*.*` is pushed; when a release is published; or by hand. Runs test/audit-aggregate.test.ts, test/audit-run.test.ts, test/calibration-aggregate.test.ts and 215 more; checks src/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **@mcptoolshop/research-os** (the package people import). Loads src/index.ts.
5. **research-os** (a command people run). Runs src/cli.ts.

## What happens through CI

1. The workflow runs 218 files in test; it checks src/ in src.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs test/audit-aggregate.test.ts, test/audit-run.test.ts, test/calibration-aggregate.test.ts and 215 more, checks src/, publishes to npm, and creates a GitHub release on a tag push.

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

Confidence is low: fewer than 20 source files reach 10 revisions in the window.

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

src/cli.ts

Read those in order to follow one run of research-os end to end. This path follows research-os (a command people run) from its entry, since CI runs only tests.

## What this map cannot see

- 1 import site could not be resolved.
- 12 writes and 7 reads use paths built at run time and are not named here.
- 101 writes and 223 reads go to the directory the command is run in or a path their caller passes, not to this repository.
- 47 writes and 142 reads go to a path their caller passes, not to this repository.
- 1 command is built at run time and not followed, and it is in tests.
- Statistics confidence is low: fewer than 20 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
