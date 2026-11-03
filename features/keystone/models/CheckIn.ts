import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const CheckIn = domainList({
  ticket: relationship({ref:'Ticket.checkIns'}),
  show: relationship({ref:'Show.checkIns'}),
  scannedBy: relationship({ref:'User.checkIns'}),
  at: timestamp(),
  method: choice(['scan', 'manual']),
  result: choice(['admitted', 'duplicate', 'wrong_show', 'void']),
}, 'canManageDoor', true);
