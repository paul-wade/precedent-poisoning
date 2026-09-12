# Precedent poisoning

Coding agents copy patterns from the files they read. This harness seeds a
shortcut in one file, asks for a sibling file, and counts how often the
shortcut is copied under four setups.

Seven tasks, each asking for a sibling of a file that already takes a
shortcut. No task names the shortcut or the correct form. Four environments:
the repository alone, plus a conventions file, plus a lint gate that reads
each edit before it lands, plus the same linter reporting after the write.
140 trials.

With no help the agent copied the shortcut in 30 of 35 trials. A conventions
file brought that to 13 of 35, though it worked much better on some fixtures
than others. The two lint arms brought it to 0 and 4 of 35.

## Running it

```bash
npm install
node run.mjs --arms none,docs,eslint,lint-after --reps 5
node analyse.mjs runs/<dir>
```

`--dry-run` prints the matrix and every prompt without running anything.
`node validate-fixtures.mjs` holds every fixture to five checks.

`runs/2026-09-12-matrix` is the run this page reports;
`node analyse.mjs runs/2026-09-12-matrix` reproduces its tables.

## Method

A fixture is a task plus a seeded shortcut. The task describes a feature. The
file that already takes the shortcut is somewhere the agent can find it, and
so is a file doing the same job correctly. The task text mentions neither.

The arms are environments. Every trial in every arm gets the same task text,
so nothing here depends on prompt wording.

- `none` — the repository, unmodified.
- `docs` — a `CLAUDE.md` stating the conventions, including every rule the
  fixtures seed against. Nothing enforces it.
- `eslint` — a `PreToolUse` hook that lints the *proposed* content and exits
  2 to refuse the write.
- `lint-after` — the same configuration as a `PostToolUse` hook: the write
  lands, the findings are returned, the agent must fix them.

`eslint` and `lint-after` differ only in when the check runs.

Every trial starts from the same commit on its own branch and asserts a clean
tree first. A trial counts as a copy if its diff introduces a finding
matching the fixture's declared rule; the any-finding rate is recorded
separately. Findings that were already in the tree are subtracted, so a trial is only
counted for what it wrote itself. Trials that read the harness are excluded and
reported.

A fixture must pass five checks before it counts: the rule fires on the seed,
the gate refuses the shortcut, the helper's return value is assignable to the
declared type without adaptation, a reference solution typechecks and lints
clean, and the gate permits that solution.

## Results

| arm | copied the seeded shortcut | 95% CI | median turns | median $ |
|---|---|---|---|---|
| `none` | 30 / 35 | 71–94% | 4 | 0.052 |
| `docs` | 13 / 35 | 23–54% | 4 | 0.055 |
| `eslint` | 0 / 35 | 0–10% | 6 | 0.069 |
| `lint-after` | 4 / 35 | 5–26% | 7 | 0.065 |

Fisher exact, two-sided: none vs docs p=0.00006; none vs eslint p<1e-6; docs
vs eslint p=0.00006; docs vs lint-after p=0.024; eslint vs lint-after
p=0.114. No contaminated trials.

| fixture | seeded shortcut | `none` | `docs` | `eslint` | `lint-after` |
|---|---|---|---|---|---|
| `fetch-invoices` | `as` cast on parsed JSON | 3/5 | 0/5 | 0/5 | 1/5 |
| `jwt-issuer` | `as string` on an env var | 4/5 | 0/5 | 0/5 | 0/5 |
| `exports-summary` | `any` request body | 5/5 | 5/5 | 0/5 | 1/5 |
| `customer-name` | `!` on a `find` result | 5/5 | 3/5 | 0/5 | 0/5 |
| `schedule-run` | `new Date()` not a Clock | 4/5 | 4/5 | 0/5 | 2/5 |
| `refund-order` | `throw` not a Result | 5/5 | 1/5 | 0/5 | 0/5 |
| `not-found` | literal status not the taxonomy | 4/5 | 0/5 | 0/5 | 0/5 |

Five repetitions per cell cannot separate most of these; 3/5 against 5/5 is
p=0.44. Per-fixture cells are descriptive.

Splitting the `none` arm by whether a compliant example was read before the
first write:

| subset | none read | one read | p |
|---|---|---|---|
| all seven | 23 / 24 | 7 / 11 | 0.026 |
| generic fixtures | 12 / 12 | 5 / 8 | 0.049 |
| repository-local | 11 / 12 | 2 / 3 | 0.371 |

## Discussion

This section is interpretation. The results above do not depend on it.

Across the seven fixtures the `docs` arm scored 0, 0, 5, 3, 4, 1 and 0. The
`eslint` arm scored 0 on all seven. Both arms use the same rules, in the same
repository, with the same model. One writes the rules down and the other
checks them.

The two fixtures the conventions file did not move have something in common:
the task makes the shortcut the obvious implementation. `exports-summary`
gives the agent a request body and a literal response shape, so `any` is
close to forced. `schedule-run` needs the current time, and `new Date()` is
the first thing most code reaches for. In `refund-order` and `not-found` the
compliant path is a function call and nothing in the task discourages it.
That pattern covers all seven fixtures. Sorting them by whether the rule is
repository-specific covers four, which is why v1's claim was withdrawn. We
noticed this after seeing the results and have not tested it.

Trials that read a compliant example copied the shortcut less often, but
plenty still did: 7 of the 11 that found one copied anyway.

`eslint` and `lint-after` cannot be told apart at this sample size
(p=0.114). Checking before the write was not more expensive than reporting
after it. Both arms took about two more turns than doing nothing.

## Threats to validity

**Construct.** "Introduced a lint finding" is a proxy for "copied the
shortcut", and they diverge — one trial avoided the `as` cast and returned an
unsafe value instead. Both rates are recorded.

**Internal.** `jwt-issuer`'s prompt names `src/config/`, the directory
holding both the stale and the clean file, so its read pattern is partly
assigned rather than observed. The read-path result is correlational; the
design does not establish direction, and a trial disposed to write good code
may also be disposed to look around.

**External.** One model (`claude-haiku-4-5-20251001`), one CLI (2.1.265), one
repository, seven fixtures. Sampling is not deterministic and no seed is
exposed; a rerun will not match.

**Statistical.** Five repetitions per cell. Pooled arms are 35 trials. The
repository-local row of the read-path table has three trials in one cell,
which is too few to draw anything from.

## Fixtures that were cut

Eight were built and three cut, all in the git history.

- **`refund-order`** and **`not-found`** were cut, rebuilt and kept. The
  first delegated its failure to an existing helper that threw, so nothing
  threw in the new file. The second ended "Return the response the codebase
  uses…", which told the agent a convention existed and to go find it;
  removing that clause moved it from 1/5 to 4/5.
- **`customer-orders`** was cut after three attempts. Its first version
  scored 4/5 only because the compliant answer did not compile, so agents had
  no way to get it right. The third check exists because of this fixture.

Seven checks in this project reported success while testing nothing. That
includes the check added to catch this exact problem: it wrote its probe to a
dotfile, which TypeScript does not compile. All seven were found by
deliberately breaking them rather than by reading the code.

## Environment

| | |
|---|---|
| Claude Code | 2.1.265 |
| model | `claude-haiku-4-5-20251001` |
| Node | 25.7.0 |
| ESLint | 9.39.5 |
| TypeScript | 5.9.3 |
| OS | Windows 11 |

The Claude Code version is the one to watch. Both lint arms rely on a hook
exiting 2 to refuse or report an edit, and that behaviour belongs to a
particular build.

## Layout

```
src/                   the repository under test; some files take shortcuts
arms/                  the conventions file and the two lint hooks
run.mjs                the matrix: fixtures x arms x reps
analyse.mjs            tables from a run
validate-fixtures.mjs  the five checks a fixture must pass
findings/              versioned findings, frozen when published
runs/                  published runs, with transcripts
```

## Prior work

Agents imitating nearby code is not new. It is the premise of work on
learning a project's own style, going back to NATURALIZE ([Allamanis et al.,
FSE 2014](https://doi.org/10.1145/2635868.2635883)), and of the survey
literature on language models of code ([Allamanis et al.,
2018](https://arxiv.org/abs/1709.06182)). Linting an agent's proposed edit
from a hook is a common setup that predates this repository.

We have not found a published comparison of the same rule set written down
against the same rule set enforced, on the same tasks in the same
repository. That is what this run does.

## Revisions

Findings are versioned. Each is frozen when published; this page is the
current summary.

- [v2, 2026-09-12](findings/2026-09-12-v2.md) — 140 trials, seven fixtures.
- [v1, 2026-09-11](findings/2026-09-11-v1.md) — 75 trials, five fixtures.
  **Superseded.**

v2 retracts v1's claim that a conventions file cannot move a rule true only
in this repository. v1 drew that from one fixture. With three, it does move
them, as much as it moves generic rules. v2 also weakens v1's read-path
result and reverses its cost finding.

## Citation

```bibtex
@software{wade_precedent_poisoning_2026,
  author = {Wade, Paul},
  title  = {Precedent poisoning: how one stale file changes what a coding agent writes},
  year   = {2026},
  url    = {https://github.com/paul-wade/precedent-poisoning}
}
```

MIT licensed.
