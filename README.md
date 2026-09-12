# Precedent poisoning

An agent asked to add a file to an existing codebase copies what the codebase
already does, including the parts it does wrong. This measures how often, and
what stops it.

Seven tasks, each asking for a sibling of a file that already takes a
shortcut. No task names the shortcut or the correct form. Four environments:
the repository alone, plus a conventions file, plus a lint gate that reads
each edit before it lands, plus the same linter reporting after the write.
140 trials.

Ungated, the agent copied the seeded shortcut in 30 of 35 trials. A
conventions file took that to 13 of 35, and its effect ranged from complete
to none depending on the fixture. The two lint arms took it to 0 and 4 of 35.

## Corrections

Findings are versioned. Each is frozen when published; this page is the
current summary.

- [v2, 2026-09-12](findings/2026-09-12-v2.md) — 140 trials, seven fixtures.
- [v1, 2026-09-11](findings/2026-09-11-v1.md) — 75 trials, five fixtures.
  **Superseded.**

v2 retracts v1's claim that a conventions file cannot move a rule true only
in this repository. v1 drew that from one fixture. With three, it does move
them, as much as it moves generic rules. v2 also weakens v1's read-path
result and reverses its cost finding.

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

A fixture is a task plus a seeded shortcut. Each names a feature and nothing
else; the file that already takes the shortcut is discoverable, and so is a
compliant alternative, but neither is named.

An arm is an environment, not a differently worded prompt. Every trial in
every arm receives the same task text.

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
separately. Seeded findings are subtracted, so a trial is never charged for a
shortcut it did not write. Trials that read the harness are excluded and
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

Inference, not measurement. The tables above stand without it.

The `docs` column reads 0, 0, 5, 3, 4, 1, 0. The `eslint` column is zero
seven times. Documentation's effect varies by fixture from complete to none;
enforcement does not vary. Same rules, same repository, same model — the
difference is whether a rule is checked or only written down.

Where the document fails, the task itself argues for the shortcut.
`exports-summary` hands the agent a request body and a literal response
shape, so `any` is close to forced. `schedule-run` needs the current time and
`new Date()` is the obvious route. In `refund-order` and `not-found` the
compliant path is an API call and nothing pushes against it. This fits all
seven fixtures; the local-versus-generic distinction fits four, which is why
v1's claim was withdrawn. It is a hypothesis formed after seeing the data.

Reading a compliant example is associated with copying less often, and does
not prevent it: seven of eleven trials that found one copied anyway.

`eslint` and `lint-after` are indistinguishable on outcome here (p=0.114),
and blocking before the write is not more expensive than reporting after it.
Both cost about two turns more than doing nothing.

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
repository-local read-path row has three trials in its exemplar cell and
supports nothing.

## Fixtures that were cut

Eight were built and three cut, all in the git history.

- **`refund-order`** and **`not-found`** were cut, rebuilt and kept. The
  first delegated its failure to an existing helper that threw, so nothing
  threw in the new file. The second ended "Return the response the codebase
  uses…", which told the agent a convention existed and to go find it;
  removing that clause moved it from 1/5 to 4/5.
- **`customer-orders`** was cut after three attempts. It scored 4/5 on the
  first because its compliant answer did not compile — it measured an
  impossible convention rather than a hard one. That is why the third check
  exists.

Seven checks in this project have run green while measuring nothing,
including the one added to catch that class, which wrote its probe to a
dotfile TypeScript never compiled. Each was found by trying to make it fail.

## Environment

| | |
|---|---|
| Claude Code | 2.1.265 |
| model | `claude-haiku-4-5-20251001` |
| Node | 25.7.0 |
| ESLint | 9.39.5 |
| TypeScript | 5.9.3 |
| OS | Windows 11 |

The Claude Code version matters most: both lint arms depend on hook exit 2
semantics, and if those change the arms change with them.

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

What we have not found measured elsewhere is the comparison this run makes
directly: the same rule set, written down versus enforced, on the same tasks
in the same repository.

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
