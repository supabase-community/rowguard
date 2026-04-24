import { PolicyBuilder, collectUniqueIndexStatements } from './policy-builder';
import type { PolicyDefinition, SQLGenerationOptions } from './types';
import { escapeIdentifier } from './sql';

export function enableRLS(tables: string | string[], options?: { force?: boolean }): string {
  const list = Array.isArray(tables) ? tables : [tables];
  return list.map((t) => {
    const base = `ALTER TABLE ${escapeIdentifier(t)} ENABLE ROW LEVEL SECURITY;`;
    return options?.force ? `${base}\nALTER TABLE ${escapeIdentifier(t)} FORCE ROW LEVEL SECURITY;` : base;
  }).join('\n');
}

function flattenBuilders(builders: PolicyBuilder[] | PolicyBuilder[][]): PolicyBuilder[] {
  if (builders.length === 0) return [];
  return Array.isArray(builders[0]) ? (builders as PolicyBuilder[][]).flat() : builders as PolicyBuilder[];
}

function resolveBuilders(builders: PolicyBuilder[]): { defs: PolicyDefinition[]; resolved: PolicyBuilder[]; tables: Set<string> } {
  const defs: PolicyDefinition[] = [];
  const resolved: PolicyBuilder[] = [];
  const tables = new Set<string>();
  for (const b of builders) {
    try {
      const def = b.toDefinition();
      defs.push(def);
      resolved.push(b);
      tables.add(def.table);
    } catch { /* incomplete builder */ }
  }
  return { defs, resolved, tables };
}

export function policiesToSQL(
  builders: PolicyBuilder[] | PolicyBuilder[][],
  options?: SQLGenerationOptions & { idempotent?: boolean }
): string {
  const opts = { includeIndexes: true, ...options };
  const flat = flattenBuilders(builders);
  const idempotent = opts.idempotent !== false;
  const { defs, resolved, tables } = resolveBuilders(flat);

  const sections: string[] = [];

  sections.push(`-- Enable RLS\n` + enableRLS([...tables]));

  if (idempotent) {
    sections.push(
      `-- Drop existing policies\n` +
      defs.map((def) => `DROP POLICY IF EXISTS ${escapeIdentifier(def.name)} ON ${escapeIdentifier(def.table)};`).join('\n')
    );
  }

  sections.push(`-- Create policies\n` + resolved.map((b) => b.toSQL() + ';').join('\n'));

  if (opts.includeIndexes) {
    const indexLines = collectUniqueIndexStatements(resolved);
    if (indexLines.length > 0) {
      sections.push(`-- Create indexes\n` + indexLines.join('\n'));
    }
  }

  return sections.join('\n\n');
}

export async function applyPolicies(
  builders: PolicyBuilder[] | PolicyBuilder[][],
  client: { query(sql: string): Promise<unknown> },
  options?: SQLGenerationOptions & { idempotent?: boolean }
): Promise<void> {
  const opts = { includeIndexes: true, ...options };
  const flat = flattenBuilders(builders);
  const idempotent = opts.idempotent !== false;
  const { defs, resolved, tables } = resolveBuilders(flat);

  await client.query('BEGIN');
  try {
    for (const table of tables) {
      await client.query(`ALTER TABLE ${escapeIdentifier(table)} ENABLE ROW LEVEL SECURITY`);
    }
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      const b = resolved[i];
      if (idempotent) {
        await client.query(`DROP POLICY IF EXISTS ${escapeIdentifier(def.name)} ON ${escapeIdentifier(def.table)}`);
      }
      await client.query(b.toSQL());
      if (opts.includeIndexes) {
        for (const stmt of b.indexStatements()) {
          await client.query(stmt);
        }
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
