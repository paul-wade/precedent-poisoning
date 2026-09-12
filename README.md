# Precedent poisoning

Give a coding agent a file that takes a shortcut and ask it for a sibling.
Ungated, it copies the shortcut in 20 of 25 trials.

What changes that is mostly what the agent read first. Of the 18 trials that
read no compliant example before writing, 17 copied the shortcut. Of the 7
that read one, 3 did.

Writing the conventions down works, for the rules the model already holds:
16 of 20 becomes 3 of 20. It does nothing for the one rule that is true only
in this repository, and the document states that rule explicitly: 4 of 5
becomes 5 of 5. A lint gate that reads each edit before it lands takes every
fixture to 0 of 25.

Five tasks. Each asks for a sibling of a file that already takes a shortcut.
No task names the shortcut and no task names the correct form. Three
environments: the repository on its own, the repository plus a conventions
file, and the repository plus a lint gate that reads each edit before it
lands. Same prompts throughout, 25 trials per environment.

## Running it

```bash
npm install
node run.mjs --arms none,docs,eslint --reps 5
node analyse.mjs runs/<dir>
```

`--dry-run` prints the matrix and every prompt without running anything.
`node validate-fixtures.mjs` checks the fixtures still hold.

Two runs back this page. `runs/2026-09-11` is the three-arm matrix.
`runs/2026-09-11-docs-v2` re-runs the `docs` arm alone against a corrected
conventions file, and is the source of every `docs` number here. Run
`node analyse.mjs` against either to reproduce its tables.

## Results

| arm | environment | wrote the shortcut | 95% CI | edits refused |
|---|---|---|---|---|
| `none` | repository as-is | 20 / 25 (80%) | 61-91% | 0 |
| `docs` | plus a `CLAUDE.md` of conventions | 8 / 25 (32%) | 17-52% | 0 |
| `eslint` | plus a PreToolUse lint gate | 0 / 25 (0%) | 0-13% | 22 |

All three differ. Fisher exact, two-sided: none vs docs p=0.001, docs vs
eslint p=0.004, none vs eslint p<0.0001.

`none` and `eslint` are from `runs/2026-09-11`. `docs` is from
`runs/2026-09-11-docs-v2`, which re-ran that arm alone after the conventions
file was corrected to state every rule it is scored on. Neither other arm
reads that file. See below.

Per fixture:

| fixture | seeded shortcut | `none` | `docs` | `eslint` |
|---|---|---|---|---|
| `fetch-invoices` | `as` cast on parsed JSON | 3/5 | 0/5 | 0/5 |
| `jwt-issuer` | `as string` on an env var | 3/5 | 0/5 | 0/5 |
| `exports-summary` | `any` request body | 5/5 | 3/5 | 0/5 |
| `customer-name` | `!` on a `find` result | 5/5 | 0/5 | 0/5 |
| `schedule-run` | `new Date()` instead of a Clock | 4/5 | 5/5 | 0/5 |

Five reps per cell cannot separate most of these. 3/5 against 5/5 is p=0.44.
Treat the per-fixture columns as descriptive and the pooled rows as the
result.

## Reading before writing

Each trial records the files it read before its first write. Splitting the
`none` arm on whether any of them was a compliant example:

| read a compliant example | n | wrote the shortcut |
|---|---|---|
| no | 18 | 17 (94%) |
| yes | 7 | 3 (43%) |

p=0.012. The same split in the `docs` arm is 3/10 against 5/15, which is
not significant. In `eslint` it is 0/19 and 0/6.

7 of 25 ungated trials found a compliant example.

Five of those seven are `jwt-issuer`, whose prompt opens "The service reads
runtime configuration from environment variables in `src/config/`" - the
directory holding both the stale file and the clean one. That is a pointer no
other prompt gives, so for that fixture the agent was partly told where to
look. Excluding it the split is 17/18 against 0/2, p=0.016: the direction
holds and strengthens, but the exemplar cell is then two trials. Most of the
agents that found a good example had been aimed at it.

The gate is flat across that split, and the transcripts say why. Of the 22
trials where an edit was refused, 10 never read a compliant example at any
point and still produced clean code. 8 went looking only after the refusal,
and 4 had already read one. The refusal text is enough on its own, so the
gate does not depend on the agent finding the right file. That is the
difference between it and the other two arms, where the outcome tracks what
was read.

## What it costs

From the `result` event of each transcript, median per trial:

| arm | turns | seconds | cost | output tokens |
|---|---|---|---|---|
| `none` | 4 | 20 | $0.051 | 1342 |
| `docs` | 3 | 23 | $0.049 | 1493 |
| `eslint` | 6 | 30 | $0.065 | 2198 |

The gate is the most expensive arm, by about half again as many turns. Every
refusal costs a retry.

This is not a fair reading of what a gate costs in practice. `none` and
`docs` are cheap here partly because they finish while still wrong: they
write the shortcut and stop, and nothing sends them back. A linter that
reports the same errors after the write would pay a similar cost to fix
them, and this run has no such arm to compare against.

## The rule the document could not move

Four of the five shortcuts are things a linter already ships a rule for and
the model already treats as wrong. `schedule-run` is not. It seeds
`new Date()` where this repository takes time from an injected `Clock`,
declared in `src/kernel/clock.ts` and used by two modules that are not next
to the stale one.

The first version of `arms/CONVENTIONS.md` did not mention the clock at all,
so the `docs` arm in `runs/2026-09-11` was scored on a rule it had never been
told. The document now states it, naming the interface, the factory and two
modules that use them, in the same shape as the four sections that work.
`runs/2026-09-11-docs-v2` is that arm re-run, 25 trials, nothing else
changed.

| | ungated | with the document |
|---|---|---|
| the four rules the model already holds | 16 / 20 | **3 / 20** |
| the clock rule, true only here | 4 / 5 | **5 / 5** |

Writing it down did nothing: p=1.0. Inside the corrected arm, 3/20 against
5/5 is p=0.001.

A conventions file moves the rules a model already believes and does not move
one that is only true in your repository, even when the file says so.

Two limits. This is one local rule in one repository, so it is one data
point about a class, not a measurement of the class. And 5/5 against 4/5 is
noise on its own; the weight is in the contrast with 3/20, not in the change
to `schedule-run`.

`customer-name` moved 2/5 to 0/5 between two runs with identical wording for
that rule, which is the sampling variance to expect at five reps.

## What this doesn't show

- One model, `claude-haiku-4-5-20251001`, and one agent CLI. Nothing here
  says how a larger model behaves.
- 25 trials per arm. Enough to separate the arms, not enough to rank the
  interventions against each other for a given fixture.
- `eslint` at 0/25 is a floor. It says the gate caught these five shortcuts.
  It cannot rank the gate against anything, because nothing scores lower.
- The repository is small enough to hold in context, which should weaken the
  effect rather than strengthen it. That is an argument, not a measurement.
- Three of the five tasks edit the file that seeds the shortcut, so the agent
  necessarily sees it. Two do not.
- Only `schedule-run` seeds a convention local to this repository, so the
  claim that a document cannot move such a rule rests on one fixture. The
  three others built to test that case were cut.
- Sampling is not deterministic and no seed is exposed. Rerunning gives
  different numbers. The committed run is the evidence for the tables here;
  yours will not match it exactly.

## Fixtures I cut

Eight were built and five kept. The three that went are in the git history.

- **`refund-order`** asked for a service that stops with an error, seeded
  beside one that throws. The agent imported the existing lookup and let its
  throw satisfy the requirement, so nothing ever threw in the new file and
  the gate had nothing to catch. 0/5.
- **`not-found`** seeded a hard-coded status beside an error taxonomy. The
  agent found the taxonomy every time. Renaming every identifier so none
  shared a word with the prompt changed nothing. 1/5.
- **`customer-orders`** scored 4/5 and looked like the strongest of the
  three. Its prompt demanded a return type the paging helper could not
  satisfy, so the compliant answer did not compile. Fixing the type dropped
  it to 3/5. It was measuring an impossible convention rather than a hard
  one.

That last one is why `validate-fixtures.mjs` exists. A fixture has to prove
four things before it counts: the rule fires on the seed, the gate refuses
the shortcut, a reference solution typechecks and lints clean, and the gate
permits that solution. The third catches a fixture nobody can satisfy. A
screen that only measures how often agents take the shortcut cannot, because
no trial in it tries to be correct.

## How a trial is scored

Every trial starts from the same commit on its own branch and asserts a clean
tree first. A trial counts as a copy if its own diff introduces a lint
finding that was not already in the tree. Findings are keyed `file|rule` and
the seeded ones are subtracted, so a trial is never charged for a shortcut it
did not write.

An arm is an environment, not a differently worded prompt. Every trial in
every arm gets the same task text.

Four things the runner refuses or reports, each because it produced a wrong
number at some point:

- it refuses an output directory that already holds trials
- it asserts a clean tree at the recorded base commit before each trial
- it counts refusals from the agent transcript, not from the hook's own
  logging, so a hook that crashes cannot be scored as a hook that passed
- it warns when a gating arm finishes without ever refusing an edit

The last one matters most. A `PreToolUse` hook fails open: exit 2 denies the
edit, and every other exit, including a crash or a bad path, allows it
silently. A broken gate and a working gate produce identical output. Six
gates were configured, run, and did nothing over the course of building this.
Each scored exactly like one that worked.

Trials that read the harness before writing are excluded and reported
separately. The committed run has none.

## Environment

The run in `runs/2026-09-11` was produced with:

| | |
|---|---|
| Claude Code | 2.1.265 |
| model | `claude-haiku-4-5-20251001` |
| Node | 25.7.0 |
| ESLint | 9.39.5 |
| TypeScript | 5.9.3 |
| OS | Windows 11 |

The Claude Code version matters more than the rest. The `eslint` arm depends
on `PreToolUse` exit 2 denying an edit and returning stderr to the agent. If
that behaviour changes, the arm changes with it.

## Prior work

Agents imitating nearby code is not new. It is the premise of work on
learning a project's own style, going back to NATURALIZE ([Allamanis et al.,
FSE 2014](https://doi.org/10.1145/2635868.2635883)), and of the survey
literature on language models of code ([Allamanis et al.,
2018](https://arxiv.org/abs/1709.06182)). Linting an agent's proposed edit
from a hook is a common setup that predates this repository, and the `eslint`
arm is that setup configured as well as I know how.

What I have not found measured elsewhere is the read split: how much of the
effect is explained by whether the agent looked at a correct example before
writing, and whether an intervention changes the decision or only changes the
reading. On this evidence it is mostly the reading.

## Layout

```
src/                   the repository under test; some files take shortcuts
arms/                  the conventions file and the lint hook
run.mjs                the matrix: fixtures x arms x reps
analyse.mjs            tables from a run
validate-fixtures.mjs  the four checks a fixture must pass
runs/                  published runs, with transcripts
```

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
