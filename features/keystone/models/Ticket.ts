import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const Ticket = domainList({
  order: relationship({ref:'TicketOrder.tickets'}),
  show: relationship({ref:'Show.tickets'}),
  line: relationship({ref:'TicketOrderLine.tickets'}),
  ticketCode: unique(),
  tokenHash: secret(),
  holderName: text(),
  holderEmail: text(),
  transferredFromCode: text(),
  status: lifecycle(['valid', 'checked_in', 'void', 'refunded']),
  checkIns: relationship({ref:'CheckIn.ticket',many:true}),
}, 'canManageDoor', true);
