import { GraphQLError } from 'graphql'

type Rule = { code: string; message: string; fields?: string[] }
const AMOUNT = 'COMEDY_INVALID_AMOUNT'
const CURRENCY = { code: 'COMEDY_INVALID_CURRENCY', message: 'Currency must be a three-letter code, such as USD.' }
const TIME = 'COMEDY_INVALID_TIME_RANGE'

/** Database rules (migrations/20261108120000_comedy_club_invariants) and what a person should read when one refuses a write. */
export const CONSTRAINT_MESSAGES: Record<string, Rule> = {
  PriceTier_counts_valid: { code: 'COMEDY_CAPACITY_EXCEEDED', message: 'Sold and held tickets can’t exceed a tier’s capacity.' },
  PriceTier_amounts_valid: { code: AMOUNT, message: 'Ticket price and fee can’t be negative, and a unit must seat at least one guest.' },
  PriceTier_sale_window: { code: TIME, message: 'Ticket sales must end after they start.' },
  Show_time_order: { code: TIME, message: 'A show must end after it starts, and doors can’t open after the start.' },
  Show_capacity_non_negative: { code: 'COMEDY_INVALID_CAPACITY', message: 'Capacity can’t be negative.' },
  Run_time_order: { code: TIME, message: 'A run must end after it starts.' },
  Run_fee_non_negative: { code: AMOUNT, message: 'A run fee can’t be negative.' },
  ShowTemplate_duration_positive: { code: TIME, message: 'A show’s duration must be longer than zero minutes.' },
  Room_capacity_non_negative: { code: 'COMEDY_INVALID_CAPACITY', message: 'Capacity can’t be negative.' },
  Table_seats_positive: { code: 'COMEDY_INVALID_CAPACITY', message: 'A table needs at least one seat.' },
  Venue_rates_valid: { code: 'COMEDY_INVALID_RATE', message: 'Tax and service fee rates must be between 0% and 100%.' },
  Venue_minimum_valid: { code: AMOUNT, message: 'The drink minimum can’t be negative.' },
  VenueSettings_ranges: { code: 'COMEDY_INVALID_SETTING', message: 'Hold time must be 1 to 240 minutes, the refund window 0 to 8,760 hours, and approval amounts can’t be negative.' },
  VenueSettings_currency_code: CURRENCY,
  Venue_timezone_valid: { code: 'COMEDY_INVALID_TIMEZONE', message: 'That isn’t a recognised time zone. Use a name such as America/Chicago.' },
  TicketOrder_amounts_balance: { code: AMOUNT, message: 'An order total must equal subtotal + fees − discount + tax, with no negative parts.' },
  TicketOrder_currency_code: CURRENCY,
  TicketOrder_party_size: { code: 'COMEDY_INVALID_QUANTITY', message: 'A party needs at least one guest.' },
  TicketOrderLine_amounts_valid: { code: AMOUNT, message: 'Ticket quantities must be at least one and prices can’t be negative.' },
  TicketOrderLine_currency_code: CURRENCY,
  Payment_amounts_valid: { code: AMOUNT, message: 'A payment must be positive, and refunds and tips can’t exceed it.' },
  Payment_currency_code: CURRENCY,
  Refund_amount_positive: { code: AMOUNT, message: 'A refund must be a positive amount.' },
  Refund_currency_code: CURRENCY,
  Refund_within_payment: { code: 'COMEDY_REFUND_EXCEEDS_PAYMENT', message: 'Refunds can’t exceed what was paid, and must be in the payment’s currency.' },
  Check_amounts_balance: { code: AMOUNT, message: 'A check total must equal subtotal + tax + tip, with no negative parts.' },
  Check_tax_rate: { code: 'COMEDY_INVALID_RATE', message: 'Tax must be between 0% and 100%.' },
  Check_currency_code: CURRENCY,
  CheckItem_amounts_valid: { code: AMOUNT, message: 'Items need a quantity of at least one and a price that isn’t negative.' },
  LineupSlot_amounts_valid: { code: AMOUNT, message: 'Set length must be longer than zero; fees and bonuses can’t be negative.' },
  ComedianPayout_amount_non_negative: { code: AMOUNT, message: 'A payout can’t be negative.' },
  ComedianPayout_currency_code: CURRENCY,
  Comp_quantity_positive: { code: 'COMEDY_INVALID_QUANTITY', message: 'A comp needs at least one ticket.' },
  WaitlistEntry_party_size: { code: 'COMEDY_INVALID_QUANTITY', message: 'A party needs at least one guest.' },
  PromoCode_value_valid: { code: AMOUNT, message: 'A promo value can’t be negative, and a percentage can’t pass 100%.' },
  PromoCode_uses_valid: { code: 'COMEDY_PROMO_LIMIT', message: 'A promo can’t be used more times than its limit allows.' },
  PromoCode_window: { code: TIME, message: 'A promo must end after it starts.' },
  Room_venue_name_key: { code: 'COMEDY_DUPLICATE_NAME', message: 'This venue already has a room with that name.', fields: ['venue', 'name'] },
  Section_room_name_key: { code: 'COMEDY_DUPLICATE_NAME', message: 'This room already has a section with that name.', fields: ['room', 'name'] },
  Table_section_label_key: { code: 'COMEDY_DUPLICATE_NAME', message: 'This section already has a table with that label.', fields: ['section', 'label'] },
  WaitlistEntry_one_active_per_show_email: { code: 'COMEDY_DUPLICATE_WAITLIST', message: 'This email is already on the waitlist for that show.', fields: ['show', 'email'] },
  LineupSlot_one_host_headliner_per_show: { code: 'COMEDY_DUPLICATE_LINEUP_ROLE', message: 'This show already has a host and headliner. Cancel the existing slot first.', fields: ['show', 'role'] },
  LineupSlot_one_active_per_show_comedian: { code: 'COMEDY_DUPLICATE_LINEUP_SLOT', message: 'That comedian is already on this show’s lineup.', fields: ['show', 'comedian'] },
  Check_one_open_per_seating: { code: 'COMEDY_DUPLICATE_CHECK', message: 'This party already has an open check.', fields: ['seatingAssignment'] },
  Payment_one_live_per_check: { code: 'COMEDY_DUPLICATE_PAYMENT', message: 'This check already has a payment in progress or paid.', fields: ['check'] },
  Payment_provider_reference_key: { code: 'COMEDY_DUPLICATE_PAYMENT_REFERENCE', message: 'That payment reference has already been applied.', fields: ['providerPaymentId'] },
}

type ErrorLink = {
  message?: unknown; meta?: { target?: unknown }; code?: unknown; originalError?: unknown; cause?: unknown
  // Keystone returns uncoded Prisma failures (CHECK and trigger violations) as "Prisma error" with the text here.
  extensions?: { debug?: { message?: unknown }; prisma?: { meta?: unknown } }
} | null | undefined

function chain(error: unknown) {
  const out: ErrorLink[] = []
  let current = error as ErrorLink
  for (let depth = 0; current && depth < 6; depth++) { out.push(current); current = (current.originalError ?? current.cause) as ErrorLink }
  return out
}

/** The readable, coded refusal for a known constraint violation anywhere in the error's cause chain, or null. */
export function constraintRefusal(error: unknown): { code: string; message: string } | null {
  for (const link of chain(error)) {
    const text = [
      link?.message, typeof link?.meta === 'object' ? JSON.stringify(link.meta) : '',
      link?.extensions?.debug?.message ?? '', link?.extensions?.prisma?.meta ? JSON.stringify(link.extensions.prisma.meta) : '',
    ].join(' ')
    for (const [name, rule] of Object.entries(CONSTRAINT_MESSAGES)) if (text.includes(name)) return rule
    // Prisma sometimes reports a unique violation by its fields instead of the index name.
    const listed = /Unique constraint failed on the fields: \((.*?)\)(?:\s|$)/.exec(String(link?.message || ''))?.[1]?.match(/`([^`]+)`/g)?.map(field => field.slice(1, -1))
    // Raw SQL writes surface Postgres's own detail instead: Key (show, email)=(…) already exists.
    const keyed = /Key \((.*?)\)=\(.*\) already exists/.exec(text)?.[1]?.split(',').map(field => field.trim().replace(/^"|"$/g, '').replace(/^lower\((.*)\)$/, '$1'))
    const unwrap = (field: unknown) => String(field).replace(/^lower\((.*)\)$/, '$1')
    const fields = (link?.code === 'P2002' && Array.isArray(link?.meta?.target) ? link.meta.target : listed ?? keyed)?.map(unwrap)
    if (fields?.length) {
      const target = [...fields].map(String).sort().join(',')
      const match = Object.values(CONSTRAINT_MESSAGES).find(rule => rule.fields && [...rule.fields].sort().join(',') === target)
      if (match) return match
    }
  }
  return null
}

export function constraintGraphQLError(error: GraphQLError, refusal: { code: string; message: string }): GraphQLError {
  return new GraphQLError(refusal.message, { nodes: error.nodes, source: error.source, positions: error.positions, path: error.path, extensions: { code: refusal.code } })
}
