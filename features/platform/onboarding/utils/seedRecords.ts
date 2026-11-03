import type { GraphQLClient } from "graphql-request";

export function validateClubSeed(data: any) {
  if (!data?.venue?.name || !data.venue.timezone) throw new Error("Setup requires venue name and timezone");
  for (const section of ["rooms", "sections", "tables", "comedians", "menuItems", "templates", "paymentProviders"]) {
    if (!Array.isArray(data[section]) || !data[section].length) throw new Error(`Setup ${section} must be a non-empty list`);
  }
  const rooms = new Set<string>(data.rooms.map((r: any) => r.name));
  if (rooms.size !== data.rooms.length) throw new Error("Setup rooms contain duplicate names");
  for (const s of data.sections) if (!rooms.has(s.room)) throw new Error(`Missing room for section ${s.name}`);
  for (const t of data.tables) if (!data.sections.some((s: any) => s.name === t.section && s.room === t.room)) throw new Error(`Missing section for table ${t.label}`);
  for (const t of data.templates) if (!rooms.has(t.room) || !t.tiers?.length) throw new Error(`Invalid template ${t.title}`);
  for (const m of data.menuItems) if (!Number.isSafeInteger(m.priceCents) || m.priceCents < 0) throw new Error(`Invalid price for ${m.name}`);
}

export async function requestSeedRecord(client: Pick<GraphQLClient, "request">, entity: string, data: any) {
  const result: any = await client.request(`mutation EnsureClubSetup($entity: String!, $data: JSON!) { ensureClubOnboardingRecord(entity: $entity, data: $data) }`, { entity, data });
  const record = result?.ensureClubOnboardingRecord;
  if (!record?.id) throw new Error(`${entity} setup did not return a persisted record`);
  return record;
}

export async function runSeedPhases(start: () => Promise<{ success: boolean; error?: string }>, phases: Array<() => Promise<unknown>>, complete: () => Promise<{ success: boolean; error?: string }>) {
  const started = await start();
  if (!started.success) throw new Error(started.error || "Could not record setup progress");
  for (const phase of phases) await phase();
  const completed = await complete();
  if (!completed.success) throw new Error(completed.error || "Could not complete setup");
}
