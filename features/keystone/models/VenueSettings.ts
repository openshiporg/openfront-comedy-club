import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const VenueSettings = domainList({
  refundWindowHours: integer({defaultValue:24}),
  holdMinutes: integer({defaultValue:10}),
  approvalThresholdCents: integer({defaultValue:10000}),
  compApprovalQuantity: integer({defaultValue:4}),
  currencyCode: currency(),
}, 'canManageSettings', false, true);
