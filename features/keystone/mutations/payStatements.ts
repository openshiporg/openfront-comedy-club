import { audit, command, requirePermission } from '../lib/commands';
import { buildStatement, parseYear, statementCsv, yearRange } from '../lib/payStatement';

async function load(db: any, comedianId: string, yearInput: unknown) {
  const year = parseYear(yearInput);
  const tz = (await db.venue.findFirst({ select: { timezone: true } }))?.timezone || 'America/Chicago';
  const comedian = await db.comedian.findUnique({ where: { id: String(comedianId || '') }, select: { id: true, stageName: true, legalName: true, payeeDetailsOnFile: true } });
  if (!comedian) throw new Error('Comedian not found');
  const payouts = await db.comedianPayout.findMany({
    where: { comedianId: comedian.id, status: { not: 'void' } }, orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
    select: { id: true, status: true, amountCents: true, paidAt: true, createdAt: true, method: true, reference: true, show: { select: { title: true, startsAt: true } }, run: { select: { notes: true } } },
  });
  const { start, endExclusive } = yearRange(year, tz);
  const s = buildStatement(payouts.map((p: any) => ({ id: p.id, status: p.status, amountCents: p.amountCents ?? 0, paidAt: p.paidAt, createdAt: p.createdAt, method: p.method || 'check', reference: p.reference || '', showTitle: p.show?.title || null, showAt: p.show?.startsAt || null, runNote: p.run ? (p.run.notes || '') : null })), start, endExclusive);
  return { year, tz, comedian, ...s };
}

/** A payee's paid-out total for a calendar year (venue timezone), with a running year-to-date column. Pending payouts are shown apart. */
export async function payStatement(_: any, a: any, c: any) {
  requirePermission(c, 'canManagePayouts');
  const r = await load(c.prisma, a.comedianId, a.year);
  return { year: r.year, timezone: r.tz, comedian: { id: r.comedian.id, stageName: r.comedian.stageName, legalName: r.comedian.legalName, payeeDetailsOnFile: r.comedian.payeeDetailsOnFile }, rows: r.rows, paidCents: r.paidCents, pendingCents: r.pendingCents, pendingCount: r.pendingCount, undated: r.undated };
}

/** The CSV is built on the server and the export is audited. A replay with the same key returns the same file. */
export async function exportPayStatement(_: any, a: any, c: any) {
  requirePermission(c, 'canManagePayouts');
  return command(c, 'exportPayStatement', { comedianId: a.comedianId, year: a.year, idempotencyKey: a.idempotencyKey }, async tx => {
    const r = await load(tx, a.comedianId, a.year);
    const out = { fileName: `pay-statement-${r.year}-${r.comedian.stageName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'payee'}.csv`, rows: r.rows.length, paidCents: r.paidCents, csv: statementCsv(r.comedian, r.year, r.rows, r.tz, r.paidCents) };
    await audit(tx, c, 'pay_statement_exported', 'Comedian', r.comedian.id, null, { year: r.year, rows: out.rows, paidCents: out.paidCents }, a.idempotencyKey);
    return out;
  });
}
