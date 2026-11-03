import { MINIMAL, type TemplateType } from '../config/templates';

export function getItemsFromJsonData(data: any, type: string): string[] {
  if (!data) return [];
  switch (type) {
    case 'venue': return data.venue ? [data.venue.name] : [];
    case 'rooms': return (data.rooms || []).map((r: any) => r.name);
    case 'sections': return (data.sections || []).map((s: any) => `${s.room} · ${s.name}`);
    case 'tables': return (data.tables || []).map((t: any) => `${t.section} ${t.label}`);
    case 'comedians': return (data.comedians || []).map((c: any) => c.stageName);
    case 'menuItems': return (data.menuItems || []).map((m: any) => m.name);
    case 'templates': return (data.templates || []).map((t: any) => t.title);
    case 'promoCodes': return (data.promoCodes || []).map((p: any) => p.code);
    case 'paymentProviders': return (data.paymentProviders || []).map((p: any) => p.name);
    case 'operations': return data.operations ? [data.operations] : [];
    default: return [];
  }
}

export function getSeedForTemplate(template: TemplateType, seed: any) {
  if (template === 'full') return { ...seed, operations: 'Shows, lineups, run and history' };
  const sections = seed.sections.filter((s: any) => MINIMAL.sections.includes(s.name) && MINIMAL.rooms.includes(s.room));
  return {
    ...seed,
    rooms: seed.rooms.filter((r: any) => MINIMAL.rooms.includes(r.name)),
    sections,
    tables: seed.tables.filter((t: any) => MINIMAL.sections.includes(t.section)).slice(0, MINIMAL.tablesPerSection),
    comedians: seed.comedians.slice(0, MINIMAL.comedians),
    menuItems: seed.menuItems.slice(0, MINIMAL.menuLimit),
    templates: seed.templates.filter((t: any) => MINIMAL.templates.includes(t.title)).map((t: any) => ({ ...t, tiers: t.tiers.filter((x: any) => x.name === 'Front') })),
    promoCodes: [],
    operations: 'Two upcoming shows',
  };
}
