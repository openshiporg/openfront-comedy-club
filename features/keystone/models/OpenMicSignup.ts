import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const OpenMicSignup = domainList({
  signupKey: unique(),
  show: relationship({ref:'Show.signups'}),
  comedian: relationship({ref:'Comedian.signups'}),
  name: text(),
  email: text(),
  method: choice(['online_list', 'bucket', 'bringer']),
  lotteryNumber: integer({defaultValue:0}),
  status: lifecycle(['waiting', 'called', 'performed', 'skipped', 'withdrawn']),
  bringerGuestsRequired: integer({defaultValue:0}),
  bringerGuestsArrived: integer({defaultValue:0}),
}, 'canManageTalent', true);
