import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const LineupSlot = domainList({
  show: relationship({ref:'Show.lineup'}),
  comedian: relationship({ref:'Comedian.slots'}),
  role: choice(['host', 'opener', 'guest_set', 'feature', 'headliner', 'bringer']),
  position: integer({defaultValue:0}),
  setMinutes: integer({defaultValue:10}),
  feeCents: money(),
  bonusCents: money(),
  status: lifecycle(['offered', 'confirmed', 'declined', 'cancelled', 'performed', 'no_show']),
  confirmedAt: timestamp(),
  responseTokenHash: secret(),
  responseTokenExpiresAt: timestamp(),
  payouts: relationship({ref:'ComedianPayout.lineupSlots',many:true}),
}, 'canManageTalent', true);
