# Planned: does the task decide whether a document works?

Written 2026-09-13, before any trial has been run. Nothing here has been
measured. The point of writing it first is that the claim it replaces was
formed after seeing the data, and that is how it got overstated.

## Where this comes from

v2 found that a conventions file worked on five of seven fixtures and did
nothing on two:

| fixture | none | docs |
|---|---|---|
| `exports-summary` | 5/5 | 5/5 |
| `schedule-run` | 4/5 | 4/5 |
| the other five | 26/25* | 4/25 |

*sums across five fixtures at five reps each.

v1 had claimed the split was between rules the model already holds and rules
true only in this repository. v2 retracted that: the two resistant fixtures
are one of each kind.

What they share instead is that the task itself makes the shortcut the
obvious implementation. `exports-summary` hands the agent a request body and
a literal response shape, so `any` is close to forced. `schedule-run` needs
the current time. In the five the document moved, the compliant path is a
function call and nothing in the task points away from it.

That fits all seven. It was noticed afterwards, so it is a hypothesis and not
a result.

## Hypothesis

A conventions file changes what an agent writes when the compliant path is
already available to it, and does not when the task's own shape pushes toward
the shortcut.

## Prediction

Four new fixtures, built in matched pairs. Each pair seeds the same rule. One
member phrases the task so the shortcut is the natural implementation; the
other phrases it so the compliant path is natural. Everything else is held
fixed: same seed file, same rule, same helper, same reps.

If the hypothesis holds, the `docs` arm moves the second member of each pair
and not the first, and the `none` arm is similar for both. If `docs` moves
both, or neither, the hypothesis is wrong.

## What would falsify it

- `docs` moving the shortcut-natural member as much as the other.
- The `none` arm differing sharply between members of a pair, which would
  mean the pairs vary difficulty rather than task shape.
- A resistant fixture whose task does not push toward the shortcut.

## Decided in advance

- Four pairs, eight fixtures, three arms (`none`, `docs`, `eslint`), five
  reps. 120 trials.
- Scored on each fixture's declared rule, not any finding.
- Every fixture passes the five checks in `validate-fixtures.mjs` before a
  trial runs.
- Prompts audited for the leak that broke `not-found`: no phrase directing
  the agent toward existing code.
- The conventions file states every rule the fixtures seed against. This has
  now been got wrong twice.
- Fisher exact, two-sided, on the pooled `docs` rate within each condition.
  Per-fixture cells are descriptive; five reps cannot separate 3/5 from 5/5.
- The result is reported whichever way it goes, as v3.

## Known weakness before starting

"The task makes the shortcut natural" is a judgement, not a measurement. Two
people might sort the same prompt differently. Writing the pairs before
running anything limits the damage, because the sorting cannot be adjusted to
fit the outcome, but it does not remove it.

If a way to score task shape mechanically turns up, it belongs here instead.

## Also open, not planned

- A `cyv` arm. The harness supports one. It has never been run, and the
  scoring currently keys on ESLint findings, which would grade `cyv` on
  agreement with its competitor rather than on preventing bad code.
- More than one model. Everything so far is `claude-haiku-4-5-20251001`.
- Whether the read-path association survives an intervention that changes
  only what is read. The current evidence is correlational.
