import { AuditEvent } from './AuditEvent';
import { Check } from './Check';
import { CheckIn } from './CheckIn';
import { CheckItem } from './CheckItem';
import { Comedian } from './Comedian';
import { ComedianPayout } from './ComedianPayout';
import { Comp } from './Comp';
import { IdempotencyKey } from './IdempotencyKey';
import { InventoryHold } from './InventoryHold';
import { InventoryHoldLine } from './InventoryHoldLine';
import { LineupSlot } from './LineupSlot';
import { ManagerApproval } from './ManagerApproval';
import { MenuItem } from './MenuItem';
import { OAuthApp } from './OAuthApp';
import { OAuthToken } from './OAuthToken';
import { NotificationRecord } from './NotificationRecord';
import { OpenMicSignup } from './OpenMicSignup';
import { Payment } from './Payment';
import { PaymentCollection } from './PaymentCollection';
import { PaymentProvider } from './PaymentProvider';
import { PaymentSession } from './PaymentSession';
import { PaymentWebhookEvent } from './PaymentWebhookEvent';
import { PriceTier } from './PriceTier';
import { PromoCode } from './PromoCode';
import { PromoRedemption } from './PromoRedemption';
import { Refund } from './Refund';
import { WaitlistEntry } from './WaitlistEntry';
import { Role } from './Role';
import { Room } from './Room';
import { Run } from './Run';
import { SeatingAssignment } from './SeatingAssignment';
import { Section } from './Section';
import { Show } from './Show';
import { ShowSettlement } from './ShowSettlement';
import { ShowTemplate } from './ShowTemplate';
import { ShowGroup } from './ShowGroup';
import { Table } from './Table';
import { TableOccupancy } from './TableOccupancy';
import { Ticket } from './Ticket';
import { TicketOrder } from './TicketOrder';
import { TicketOrderLine } from './TicketOrderLine';
import { User } from './User';
import { Venue } from './Venue';
import { VenueSettings } from './VenueSettings';

const rawModels = {
  AuditEvent,
  Check,
  CheckIn,
  CheckItem,
  Comedian,
  ComedianPayout,
  Comp,
  IdempotencyKey,
  InventoryHold,
  InventoryHoldLine,
  LineupSlot,
  ManagerApproval,
  MenuItem,
  OAuthApp,
  OAuthToken,
  NotificationRecord,
  OpenMicSignup,
  Payment,
  PaymentCollection,
  PaymentProvider,
  PaymentSession,
  PaymentWebhookEvent,
  PriceTier,
  PromoCode,
  PromoRedemption,
  Refund,
  WaitlistEntry,
  Role,
  Room,
  Run,
  SeatingAssignment,
  Section,
  Show,
  ShowSettlement,
  ShowTemplate,
  ShowGroup,
  Table,
  TableOccupancy,
  Ticket,
  TicketOrder,
  TicketOrderLine,
  User,
  Venue,
  VenueSettings,
};

// Sidebar visibility follows the role: a list whose query access denies the session is hidden from navigation
// (Keystone evaluates ui.isHidden per session in admin meta). Explicit isHidden settings are kept.
type QueryAccess = (args: unknown) => unknown;
type ListConfig = { access?: { operation?: { query?: unknown } }; ui?: { isHidden?: unknown } } & Record<string, unknown>;
export const models = Object.fromEntries(Object.entries(rawModels).map(([key, entry]) => {
  const config = entry as ListConfig;
  const query: unknown = config?.access?.operation?.query;
  if (typeof query !== 'function') return [key, config];
  const existing = config?.ui?.isHidden;
  const isHidden = (args: unknown) => {
    if (existing === true) return true;
    if (typeof existing === 'function' && (existing as QueryAccess)(args)) return true;
    return !(query as QueryAccess)(args);
  };
  return [key, { ...config, ui: { ...(config.ui ?? {}), isHidden } }];
})) as typeof rawModels;
export default models;
