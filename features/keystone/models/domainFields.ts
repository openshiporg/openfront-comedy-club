import { list } from '@keystone-6/core';
import { integer, select, text } from '@keystone-6/core/fields';
import { permissions, type Permission } from '../access';
import { trackingFields } from './trackingFields';

export const money = (defaultValue = 0) => integer({ defaultValue, validation: { min: 0 } });
export const currency = () => text({ defaultValue: 'USD', validation: { match: { regex: /^[A-Z]{3}$/, explanation: 'ISO 4217 currency required' } } });
export const lifecycle = (values: string[], initial = values[0]) => select({ type: 'enum', options: values.map(value => ({ label: value.replaceAll('_', ' '), value })), defaultValue: initial, access: { create: () => false, update: () => false } });
export const choice = (values: string[], initial = values[0]) => select({ type: values.some(value => /^\d/.test(value)) ? 'string' : 'enum', options: values.map(value => ({ label: value.replaceAll('_', ' '), value })), defaultValue: initial });
export const unique = () => text({ isIndexed: 'unique', validation: { isRequired: true } });
export const secret = () => text({ access: { read: () => false, create: () => false, update: () => false } });
export function domainList(fields: Record<string, any>, permission: Permission, commandOnly = false, singleton = false, hooks?: any) {
  return list({ ...(hooks ? { hooks } : {}), ...(singleton ? {isSingleton: true, graphql: {plural: 'VenueSettingsItems'}} : {}), access: { operation: { query: permissions[permission], create: commandOnly ? () => false : permissions[permission], update: commandOnly ? () => false : permissions[permission], delete: () => false } }, fields: { ...fields, ...trackingFields } });
}
