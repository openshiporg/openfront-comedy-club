import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const Run = domainList({
  headliner: relationship({ref:'Comedian.runs'}),
  status: lifecycle(['scheduled','in_progress','closed']),
  closedAt: timestamp({ access: { create: () => false, update: () => false } }),
  startAt: timestamp(),
  endAt: timestamp(),
  runFeeCents: money(),
  notes: text(),
  shows: relationship({ref:'Show.run',many:true}),
  payouts: relationship({ref:'ComedianPayout.run',many:true}),
}, 'canManageTalent', false);
