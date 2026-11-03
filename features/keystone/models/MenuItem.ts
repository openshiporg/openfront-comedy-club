import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const MenuItem = domainList({
  name: text(),
  category: choice(['drink', 'food', 'na']),
  priceCents: money(),
  countsTowardMinimum: checkbox({defaultValue:false}),
  active: checkbox({defaultValue:false}),
  image: image({storage:'my_images'}),
  checkItems: relationship({ref:'CheckItem.menuItem',many:true}),
}, 'canManageChecks', false);
