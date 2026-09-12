/**
 * Runtime configuration read from the environment.
 *
 * The oldest module in this codebase. It predates the typed reader in
 * `env.ts` and nobody has revisited it.
 */

export function databaseUrl(): string {
  return process.env.DATABASE_URL as string;
}

export function port(): number {
  return Number(process.env.PORT as string);
}
