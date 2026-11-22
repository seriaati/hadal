import { SQL } from "bun";

const MIGRATIONS = `${import.meta.dir}/migrations`;

/**
 * The default is the `db` service of `compose.yaml`, as reached from this machine. Kept on
 * `globalThis` because `bun --hot` runs this module afresh on every change: a new pool each time
 * would leave the old one's connections open until Postgres refuses any more.
 */
export const sql: SQL = ((globalThis as { hadalSql?: SQL }).hadalSql ??= new SQL(process.env.DATABASE_URL ?? "postgres://hadal:hadal@localhost:5433/hadal"));

export async function migrate() {
  await sql`create table if not exists migrations (name text primary key)`;
  const done = new Set((await sql`select name from migrations`).map((row: { name: string }) => row.name));
  for (const name of [...new Bun.Glob("*.sql").scanSync(MIGRATIONS)].sort()) {
    if (done.has(name)) continue;
    await sql.begin(async (tx) => {
      await tx.unsafe(await Bun.file(`${MIGRATIONS}/${name}`).text());
      await tx`insert into migrations (name) values (${name})`;
    });
  }
}
