import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const Run = domainList({
  headliner: relationship({ref:'Comedian.runs'}),
  startAt: timestamp(),
  endAt: timestamp(),
  runFeeCents: money(),
  notes: text(),
  shows: relationship({ref:'Show.run',many:true}),
  payouts: relationship({ref:'ComedianPayout.run',many:true}),
}, 'canManageTalent', false);
