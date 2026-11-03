import { Building2, Package } from 'lucide-react';
import seed from '../lib/seed.json';

export type TemplateType = 'full' | 'minimal';

export interface SectionDefinition {
  id: number;
  type: string;
  label: string;
}

export const CLUB_TEMPLATES: Record<TemplateType, { name: string; description: string; icon: React.ReactNode }> = {
  full: { name: 'Complete setup', description: 'Venue, rooms, 32 tables, 12 comedians, menu, templates, a headliner run, three weeks of shows and recent history.', icon: <Building2 className="h-5 w-5" /> },
  minimal: { name: 'Basic setup', description: 'Venue, one room, one template and two shows.', icon: <Package className="h-5 w-5" /> },
};

export const MINIMAL = {
  rooms: ['Main Room'],
  sections: ['Front'],
  tablesPerSection: 4,
  templates: ['Tuesday Showcase'],
  menuLimit: 8,
  comedians: 4,
};

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  { id: 1, type: 'venue', label: 'Venue' },
  { id: 2, type: 'rooms', label: 'Rooms' },
  { id: 3, type: 'sections', label: 'Sections' },
  { id: 4, type: 'tables', label: 'Tables' },
  { id: 5, type: 'comedians', label: 'Comedians' },
  { id: 6, type: 'menuItems', label: 'Menu' },
  { id: 7, type: 'templates', label: 'Show templates' },
  { id: 8, type: 'promoCodes', label: 'Promo codes' },
  { id: 9, type: 'paymentProviders', label: 'Payment providers' },
  { id: 10, type: 'operations', label: 'Shows and history' },
];

export const SEED_VERSION = (seed as any).venue.name;
