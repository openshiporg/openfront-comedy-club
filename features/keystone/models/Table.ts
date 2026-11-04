import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const Table = domainList({
  section: relationship({ref:'Section.tables'}),
  label: text(),
  seats: integer({defaultValue:4}),
  combinableWith: relationship({ref:'Table.combinedBy',many:true}),
  combinedBy: relationship({ref:'Table.combinableWith',many:true}),
  x: integer({defaultValue:0}),
  y: integer({defaultValue:0}),
  shape: choice(['round', 'square', 'rectangle']),
  holds: relationship({ref:'InventoryHold.tables',many:true}),
  assignments: relationship({ref:'SeatingAssignment.tables',many:true}),
  occupancies: relationship({ref:'TableOccupancy.table',many:true}),
}, 'canManageSettings', false, false, {
  validate: {
    async create({ resolvedData, context, addValidationError }: any) { await uniqueLabel(context, resolvedData, null, addValidationError); },
    async update({ resolvedData, item, context, addValidationError }: any) { await uniqueLabel(context, resolvedData, item, addValidationError); },
  },
});

/** A table label must identify one table in the room: two "B1"s on one night cannot be told apart. */
async function uniqueLabel(context: any, data: any, item: any, addValidationError: (m: string) => void) {
  const label = String(data.label ?? item?.label ?? '').trim();
  if (!label) return addValidationError('Table label is required');
  const sectionId = data.section?.connect?.id ?? item?.sectionId;
  if (!sectionId) return;
  const section = await context.prisma.section.findUnique({ where: { id: sectionId }, select: { roomId: true } });
  if (!section) return;
  const clash = await context.prisma.table.findFirst({ where: { label: { equals: label, mode: 'insensitive' }, section: { roomId: section.roomId }, ...(item ? { id: { not: item.id } } : {}) }, select: { id: true } });
  if (clash) addValidationError(`Table label ${label} is already used in this room`);
}
