import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const Comedian = domainList({
  stageName: text(),
  legalName: text(),
  email: text(),
  phone: text(),
  bio: text(),
  headshot: image({storage:'my_images'}),
  socials: json(),
  homeCity: text(),
  defaultFeeCents: money(),
  notes: text(),
  payeeDetailsOnFile: checkbox({defaultValue:false}),
  status: lifecycle(['active', 'inactive']),
  slots: relationship({ref:'LineupSlot.comedian',many:true}),
  runs: relationship({ref:'Run.headliner',many:true}),
  signups: relationship({ref:'OpenMicSignup.comedian',many:true}),
  payouts: relationship({ref:'ComedianPayout.comedian',many:true}),
}, 'canManageTalent', false);
