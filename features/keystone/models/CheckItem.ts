import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const CheckItem = domainList({
  check: relationship({ref:'Check.items'}),
  menuItem: relationship({ref:'MenuItem.checkItems'}),
  name: text(),
  priceCents: money(),
  qty: integer({defaultValue:1}),
  countsTowardMinimum: checkbox({defaultValue:false}),
  voided: checkbox({defaultValue:false}),
  voidReason: text(),
  approval: relationship({ref:'ManagerApproval.items'}),
}, 'canManageChecks', true);
