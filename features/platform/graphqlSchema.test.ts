import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildSchema, parse, validate } from 'graphql';

// Every query or mutation string under features/platform and features/storefront must
// validate against the committed schema.graphql, so a removed model or field fails here
// instead of returning a 500 on a live page.
const schema = buildSchema(fs.readFileSync(path.join(process.cwd(), 'schema.graphql'), 'utf8'));

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((f) => {
    const p = path.join(dir, f.name);
    return f.isDirectory() ? files(p) : /\.tsx?$/.test(f.name) && !/\.test\./.test(f.name) ? [p] : [];
  });
}

test('every GraphQL selection in platform and storefront matches schema.graphql', () => {
  const problems: string[] = [];
  let checked = 0;
  for (const root of ['features/platform', 'features/storefront']) {
    for (const file of files(root)) {
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/`([^`]*)`/g)) {
        const text = m[1].replace(/\$\{[^}]*\}/g, '');
        if (!/^\s*(query|mutation|\{)/.test(text)) continue;
        let doc;
        try { doc = parse(text); } catch { continue; }
        checked++;
        for (const e of validate(schema, doc)) {
          if (/Variable|never used|not defined/.test(e.message) && !/Cannot query|Unknown/.test(e.message)) continue;
          problems.push(`${file}: ${e.message}`);
        }
      }
    }
  }
  assert.ok(checked > 20, `only ${checked} queries found`);
  assert.deepEqual(problems, []);
});

test('removed notification model is gone from the schema', () => {
  assert.equal(schema.getType('NotificationRecord'), undefined);
});
