# Conventions

The `docs` arm copies this file to `CLAUDE.md` at the repository root, which is
the file the agent reads before it does anything. Nothing else about that arm
differs from `none`.

## Types

Do not use `as` type assertions. An assertion claims a type without checking
it; the value can still be anything at runtime. Parse or validate instead, and
use the validated result.

Do not use `any`. It switches off checking for every value that flows through
it.

Do not use the non-null assertion `!`. If a lookup can miss, handle the miss.

Some older modules in this repository still do all three. They predate these
conventions and are not the pattern to copy.

## Configuration

Environment variables are read through the helpers in `src/config/env.ts`,
which report a missing variable rather than returning an empty string.

## Responses

A response body from the network is unknown until it has been checked. See
`src/lib/fetch-customers.ts` for the shape this codebase uses.

## Time

Do not call `new Date()` directly. A function that needs the current time
receives a `Clock` instead, so tests can freeze the clock. The `Clock`
interface and `systemClock()` factory live in `src/kernel/clock.ts`; see
`src/invoices/invoice-due.ts` and `src/payments/payment-processor.ts` for the
pattern.
