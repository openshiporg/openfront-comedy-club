import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const SeatingAssignment = domainList({
  show: relationship({ref:'Show.assignments'}),
  ticketOrder: relationship({ref:'TicketOrder.tableAssignment'}),
  tables: relationship({ref:'Table.assignments',many:true}),
  partySize: integer({defaultValue:1}),
  status: lifecycle(['unseated', 'seated', 'closed']),
  seatedAt: timestamp(),
  server: relationship({ref:'User.seatings'}),
  checks: relationship({ref:'Check.seatingAssignment',many:true}),
  occupancies: relationship({ref:'TableOccupancy.assignment',many:true}),
}, 'canManageDoor', true);
