import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const Comp = domainList({
  show: relationship({ref:'Show.comps'}),
  issuedBy: relationship({ref:'User.issuedComps'}),
  recipientName: text(),
  recipientEmail: text(),
  quantity: integer({defaultValue:1}),
  reason: choice(['industry', 'comic_guest', 'press', 'service_recovery']),
  approval: relationship({ref:'ManagerApproval.comps'}),
}, 'canManageOrders', true);
