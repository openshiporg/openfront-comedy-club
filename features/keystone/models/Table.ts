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
}, 'canManageSettings', false);
