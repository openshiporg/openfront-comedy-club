import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const AuditEvent = domainList({
  actor: relationship({ref:'User.auditEvents'}),
  action: text(),
  targetList: text(),
  targetId: text(),
  before: json(),
  after: json(),
  reason: text(),
  requestId: text(),
  eventKey: unique(),
}, 'canReadAudit', true);
