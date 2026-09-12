# Precedent poisoning

A coding agent asked to add a file to an existing repository copies what the
repository already does - including the parts it does wrong.

This is a harness that measures how often, and what stops it.

## The finding

Five tasks. Each asks for a sibling of a file that already takes a shortcut.
No task names the shortcut, and no task names the correct form: the question
is whether the agent can tell what this codebase does. Twenty-five trials per
arm, each from the same commit on its own branch.

| arm | environment | wrote the shortcut | edits refused |
|---|---|---|---|
| `none` | the repository as-is | **20 / 25** | 0 |
| `docs` | plus a conventions file the agent reads | **9 / 25** | 0 |
| `eslint` | plus a type-aware lint gate on every edit | **0 / 25** | 22 / 25 |

Per fixture, because a pooled number hides a fixture nothing is measuring:

| fixture | seeded shortcut | `none` | `docs` | `eslint` |
|---|---|---|---|---|
| `fetch-invoices` | `as` cast on parsed JSON | 3 / 5 | 0 / 5 | 0 / 5 |
| `jwt-issuer` | `as string` on an env var | 3 / 5 | 0 / 5 | 0 / 5 |
| `exports-summary` | `any` request body | 5 / 5 | 3 / 5 | 0 / 5 |
| `customer-name` | `!` on a `find` result | 5 / 5 | 2 / 5 | 0 / 5 |
| `schedule-run` | `new Date()` for the time | 4 / 5 | **4 / 5** | 0 / 5 |

Four of the five shortcuts are things the model already believes are wrong.
Left alone with a file that does them, it does them anyway.

The fifth row is the one to look at twice. `schedule-run` seeds the only
convention that is true *only here* - time comes from an injected `Clock`,
declared in `src/kernel/clock.ts` and used by two modules that are not
adjacent to the stale one. Writing it down changes nothing: 4 of 5 with the
conventions file, 4 of 5 without. Every other fixture falls, two of them to
zero.

That is the difference between reminding and teaching. A document works when
the model already agrees with it. For a rule that exists only in this
repository, there is nothing to remind it of.

## The mechanism

The headline is the less interesting half. Splitting each arm by whether the
agent read a compliant example before its first write:

| arm | read a compliant example | n | wrote the shortcut |
|---|---|---|---|
| `none` | no | 18 | **17 / 18** |
| `none` | yes | 7 | 3 / 7 |
| `docs` | no | 13 | 7 / 13 |
| `docs` | yes | 12 | 2 / 12 |
| `eslint` | no | 19 | 0 / 19 |
| `eslint` | yes | 6 | 0 / 6 |

**Ungated, 17 of the 18 trials that read no compliant example copied the
shortcut.** Given one, that falls to 3 of 7.

The agent is not choosing badly. It is generalising correctly from the only
evidence it looked at, and whether it looks at anything else is close to a
coin flip: 7 of 25 ungated trials did.

The `docs` arm moves that. With a conventions file, 12 of 25 trials reached a
compliant example rather than 7, and the trials that did were the ones that
got it right. The `eslint` arm does something different in kind - 0 of 19 and
0 of 6, identical - because it does not matter what the agent read when it is
not permitted to be wrong.

The full run is in `runs/2026-09-11`; `node analyse.mjs runs/2026-09-11`
reproduces every table on this page.

## What each arm is

An arm is an *environment*, never a different prompt. Every trial in every arm
receives the same task text, so nothing here measures prompt wording.

- **`none`** - the repository, unmodified.
- **`docs`** - a `CLAUDE.md` stating the conventions in prose. The agent may
  read it or ignore it; nothing enforces it.
- **`eslint`** - a `PreToolUse` hook that lints the *proposed* content before
  the write lands and exits 2 to refuse it. Type-aware
  (`recommendedTypeChecked`), plus `consistent-type-assertions: never`,
  `no-explicit-any`, `no-non-null-assertion` and `no-unsafe-assignment`.

The `eslint` arm is the honest competitor, not a strawman. It lints the text
of the edit, which is the strongest thing a hook can do, and it is configured
to catch every shortcut the fixtures seed.

## Running it

```bash
npm install
node run.mjs --arms none,docs,eslint --reps 5
node analyse.mjs runs/<dir>
```

`--dry-run` prints the matrix and every prompt without running anything.

## How a trial is scored

A trial is a copy if the agent's own diff introduces a lint finding that was
not in the tree before it started. Findings are keyed `file|rule` and the
pre-existing seeded ones are subtracted, so a trial is never charged for a
shortcut it did not write.

Four things the runner refuses or reports, because each one produced a wrong
number at some point while this was being built:

- it refuses an output directory that already holds trials
- it asserts the working tree is clean before each trial, and that `HEAD` is
  the recorded base commit
- it counts refusals from the agent transcript, not from the hook's own
  logging, so a gate that crashes cannot be scored as a gate that passed
- it warns when a gating arm completes without ever having refused an edit

That last one matters more than it sounds. A `PreToolUse` hook fails **open**:
exit 2 denies the edit, and every other exit - including a crash, a bad path,
an unhandled exception - allows it silently. A broken gate and a working gate
produce identical output. Five gates were configured, run, and silently did
nothing over the course of building this; each scored exactly like one that
worked.

## What this does not show

- One model (`claude-haiku-4-5-20251001`) and one agent CLI. Nothing here says
  how a larger model behaves.
- Twenty trials per arm. Enough to separate 16/20 from 2/20; not enough to
  rank `docs` against `eslint`.
- The repository is small. An agent can hold it in context, which if anything
  should make the effect *weaker* than in a large codebase, not stronger - but
  that is an argument, not a measurement.
- Three of the five tasks edit the file that seeds the shortcut, so the agent
  necessarily sees it. The other two do not.
- Four of the five shortcuts - `as`, `any`, `!` - are ones a linter already
  ships a rule for and the model already believes are wrong. That is likely
  why a document moves them so far: it is reminding, not teaching.
- Only `schedule-run` seeds a convention local to this repository, where time
  comes from an injected `Clock`. One fixture is not enough to say whether the
  effect differs for conventions a model has no prior about, and the reader
  should discount any such claim here accordingly. Three fixtures built to
  test exactly that - a `Result` instead of a thrown error, cursor paging, an
  error taxonomy - were cut, and why is worth reading.

## The three fixtures that were cut

Eight fixtures were built; five survived. The three that did not are in the
git history and are worth more than a footnote, because each failed in a
different way and only one of them failed for the reason anyone expects.

- **`refund-order`** asked for a new service that stops with an error, seeded
  beside one that throws. The agent imported the existing lookup and let *its*
  throw satisfy the requirement, so no `ThrowStatement` ever landed in the new
  file. The gate had nothing to catch. `0/5`.
- **`not-found`** seeded a hard-coded status beside an error taxonomy. The
  agent found the taxonomy every time. Renaming every identifier so none
  shared a word with the prompt changed nothing: `1/5`.
- **`customer-orders`** looked like the strongest of the three at `4/5` - and
  was the most broken. Its prompt demanded a return type the paging helper
  could not satisfy, so the compliant answer *did not compile*. It was not
  measuring a hard convention; it was measuring an impossible one. Fixing the
  type dropped it to `3/5`.

That last one is why `validate-fixtures.mjs` exists, and why it checks that a
reference solution typechecks and lints clean. A screen that only measures
how often agents take the shortcut cannot distinguish a fixture that is hard
from one that is impossible, because nothing in such a screen ever tries to
be correct.

## Prior art

Two parts of this are not new, and saying so first is cheaper than being told.
That agents imitate nearby code is the premise of every "learn this project's
style" tool, from NATURALIZE onward. Linting an agent's proposed edit from a
`PreToolUse` hook is already a common community setup, and the `eslint` arm
here is that setup, configured as well as I know how to configure it.

What is new is the second table. Prior work asks whether a model can be made
to follow a project's conventions. That question hides the one underneath it:
**what the model looked at before it decided**, and whether an intervention
changes the decision or only changes the reading.

The data say it is the reading. Ungated, a trial that read no compliant
example copied the shortcut 17 times out of 18. Given one, that falls to 3 of
7 - same arm, same prompt, same model. And whether the agent reaches a
compliant example when nothing pushes it there is close to a coin flip: 7 of
25 ungated trials did.

That reframes what a conventions file is doing. It is not teaching the model
that `as` casts are bad - it already believes that, which is why the file
works at all on four of these five fixtures, and why it does nothing for the
fifth. What it reliably changes is the odds that the right evidence is in
front of the model when it writes: 12 of 25 trials reached a compliant
example with the file present, against 7 without.

The gate is not a stronger version of the same thing. At 0 of 19 and 0 of 6 it
is flat across the split, because what the agent read stops mattering once it
cannot commit the mistake. That is also its limit: a floor of zero ranks it
against nothing, and says only that these five shortcuts were within reach of
a rule someone had already written.

If that holds, the lever for any tool in this space is not a better rule set.
It is the read path.

## Layout

```
src/            the repository under test; some files take shortcuts
arms/           the conventions file and the lint hook
run.mjs         the matrix: fixtures x arms x reps
analyse.mjs     pooled and per-fixture tables
runs/           published runs
```
