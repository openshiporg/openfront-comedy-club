import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const TableOccupancy = domainList({
  occupancyKey: text({isIndexed:'unique',db:{isNullable:true}}),
  show: relationship({ref:'Show.occupancies'}),
  table: relationship({ref:'Table.occupancies'}),
  hold: relationship({ref:'InventoryHold.occupancies'}),
  assignment: relationship({ref:'SeatingAssignment.occupancies'}),
}, 'canManageDoor', true);
