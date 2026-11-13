![openfront-comedy-club](.github/logo.svg)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fopenshiporg%2Fopenfront-comedy-club&env=DATABASE_URL%2CSESSION_SECRET)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/openfront-comedy-club)

Openfront Comedy Club is a self-hostable application for comedy clubs. It runs the show calendar, who is on the bill, ticket sales, table seating, the door, the food and drink check with its two-item minimum, comedian pay and the nightly close.

**Documentation:** [docs.openship.org/docs/openfront/comedy-club](https://docs.openship.org/docs/openfront/comedy-club)

## Live

The Laugh Track

| | |
|---|---|
| **Storefront** | [comedy-club.openship.org](https://comedy-club.openship.org) |
| **Dashboard** | [comedy-club.openship.org/dashboard](https://comedy-club.openship.org/dashboard) |

[Learn more →](https://openship.org/products/openfront-comedy-club)

[Documentation →](https://docs.openship.org/docs/openfront/comedy-club/)

## What is built

**Calendar and booking**
- Venue, rooms (table seating or general admission), sections and tables with a floor map.
- Weekly show templates (RRULE text such as `FREQ=WEEKLY;BYDAY=TU`) that generate eight weeks of shows, safe to run twice.
- Headliner runs (Thursday to Sunday) with a run fee, and open mic nights with a signup window and a lottery.
- Lineups with host, opener, guest set, feature and headliner, set lengths and running order. One host and one headliner per show. Each fee is copied onto the slot when it is booked, so later changes to a comedian's default fee never change past pay.

**Selling**
- Price tiers with capacity counters owned by the server. Holds last 10 minutes and are placed under a per-show database lock, so two buyers can never take the last seat or the same table.
- Promo codes (percent, fixed amount or comp) reserved with the hold and committed on payment.
- Checkout freezes the quote, takes payment through the payment adapter and only then turns the hold into tickets. A payment the provider cannot confirm stays pending for reconciliation and is never marked paid on a timeout.
- Orders keep a copy of tier name, price, fees and tax at purchase. Self-cancel inside the refund window, staff refunds after it, and refunds above a threshold need a second user's approval.
- Comps issue tickets at zero cents that still count against capacity; large comps need approval.

**The night**
- Door check-in by ticket code or scan token. A second scan returns duplicate and never admits twice.
- Seat a party at one or more tables (one live seating per table per show).
- Table checks with the two-item minimum per guest, worked out at close from the numbers saved when the check was opened. Waiving it needs approval.
- Closing the night creates comedian payouts and a settlement (tickets, fees, discounts, refunds, food and drink, minimum shortfall, tips, talent cost, net).

**Dashboard** (`/dashboard`): Tonight (default), Shows, Orders, Lineups and talent, Open mic, Floor and menu, Payouts, Promo codes, Customers, Payment providers, Settings, plus the generic list pages as a fallback. First-run setup is in the sidebar card.

**Storefront** (plain, unstyled): upcoming shows, show page with lineup and tier or table choice, checkout with a hold timer and Stripe, order confirmation with ticket codes, find-my-order lookup with self-cancel, and open mic signup. It only calls the custom GraphQL operations; the raw lists are not public.

**MCP**: the Keystone MCP transport at `/api/mcp-transport/mcp` (OAuth or session) with the standard model tools plus `showsOnSale`, `showAvailability`, `publishShow`, `checkInTicket`, `closeShow` and `refundTicketOrder`. The vertical tools call the same custom mutations the dashboard uses, as the signed-in caller.

## Setup

Create a `.env` file with:

```
DATABASE_URL=postgresql://...
SESSION_SECRET=<random string of 48 or more characters>
PUBLIC_SIGNUPS_ALLOWED=false
NEXT_PUBLIC_STRIPE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

```bash
npm install
npm run dev      # builds the schema, applies migrations, starts Next
```

Open `/dashboard/init` to create the first admin, then use the setup card in the sidebar. The complete template adds a venue with 32 tables, 12 comedians, a menu, show templates, a headliner run, three weeks of shows and recent history. The basic template adds one room, one template and two shows.

Expired holds are released on the next availability read, and stale pending payments are settled with the provider on that same read. There is no cron or scheduler.

## Data

Money is stored as integer cents with a currency code; percentages are basis points. Customer-visible codes (order number, ticket code) are random, never sequential. Scan tokens are stored only as hashes. Every state change goes through a custom mutation that checks the current state, writes an audit event and takes an idempotency key. Migrations live in `migrations/`.

## Roles

`canManageShows`, `canManageTalent`, `canManageDoor`, `canManageChecks`, `canManagePayouts`, `canManageOrders`, `canManageSettings`, `canManagePayments`, `canIssueRefunds`, `canReadAudit`, `canManageOnboarding`, plus people and role management.

## Tests

```bash
node --import tsx --test features/keystone/lib/money.test.ts features/keystone/lib/time.test.ts
```

## The Openfront Ecosystem

Every Openfront is open source and self-hostable. Try any of them live.

| Product | For | Repository | Live | Docs |
|---|---|---|---|---|
| Openfront E-commerce | Online store: catalog, checkout, orders, fulfillment | [openfront](https://github.com/openshiporg/openfront) | [e-commerce.openship.org](https://e-commerce.openship.org) | [Docs](https://docs.openship.org/docs/openfront/ecommerce) |
| Openfront Restaurant | Online ordering, POS and kitchen display | [openfront-restaurant](https://github.com/openshiporg/openfront-restaurant) | [restaurant.openship.org](https://restaurant.openship.org) | [Docs](https://docs.openship.org/docs/openfront/restaurant) |
| Openfront Grocery | Grocery ordering, lots, expiry and pickup | [openfront-grocery](https://github.com/openshiporg/openfront-grocery) | [grocery.openship.org](https://grocery.openship.org) | [Docs](https://docs.openship.org/docs/openfront/grocery) |
| Openfront Gym | Memberships, classes, check-in and billing | [openfront-gym](https://github.com/openshiporg/openfront-gym) | [gym.openship.org](https://gym.openship.org) | [Docs](https://docs.openship.org/docs/openfront/gym) |
| Openfront Hotel | Reservations, front desk, housekeeping, folios | [openfront-hotel](https://github.com/openshiporg/openfront-hotel) | [hotel.openship.org](https://hotel.openship.org) | [Docs](https://docs.openship.org/docs/openfront/hotel) |
| Openfront Rental | Short-term rental bookings and calendars | [openfront-rental](https://github.com/openshiporg/openfront-rental) | [rental.openship.org](https://rental.openship.org) | [Docs](https://docs.openship.org/docs/openfront/rental) |
| Openfront Salon | Appointments, stylists and services | [openfront-salon](https://github.com/openshiporg/openfront-salon) | [salon.openship.org](https://salon.openship.org) | [Docs](https://docs.openship.org/docs/openfront/salon) |
| Openfront Barbershop | Bookings, walk-ins and barbers | [openfront-barbershop](https://github.com/openshiporg/openfront-barbershop) | [barbershop.openship.org](https://barbershop.openship.org) | [Docs](https://docs.openship.org/docs/openfront/barbershop) |
| Openfront Coffee Shop | Café ordering and counter POS | [openfront-coffeeshop](https://github.com/openshiporg/openfront-coffeeshop) | [coffee-shop.openship.org](https://coffee-shop.openship.org) | [Docs](https://docs.openship.org/docs/openfront/coffee-shop) |
| Openfront Real Estate | Listings, showings and transactions | [openfront-realestate](https://github.com/openshiporg/openfront-realestate) | [real-estate.openship.org](https://real-estate.openship.org) | [Docs](https://docs.openship.org/docs/openfront/real-estate) |
| Openfront Dealership | Inventory, test drives, deals and service | [openfront-dealership](https://github.com/openshiporg/openfront-dealership) | [dealership.openship.org](https://dealership.openship.org) | [Docs](https://docs.openship.org/docs/openfront/dealership) |
| Openfront Vape | Age-gated retail with compliance controls | [openfront-vape](https://github.com/openshiporg/openfront-vape) | [vape.openship.org](https://vape.openship.org) | [Docs](https://docs.openship.org/docs/openfront/vape) |
| Openfront Convenience | Convenience store POS and inventory | [openfront-convenience](https://github.com/openshiporg/openfront-convenience) | [convenience.openship.org](https://convenience.openship.org) | [Docs](https://docs.openship.org/docs/openfront/convenience) |
| Openfront Collectibles | Graded items, consignment and provenance | [openfront-collectibles](https://github.com/openshiporg/openfront-collectibles) | [collectibles.openship.org](https://collectibles.openship.org) | [Docs](https://docs.openship.org/docs/openfront/collectibles) |
| Openfront Cannabis | Dispensary menu, packages and recalls | [openfront-cannabis](https://github.com/openshiporg/openfront-cannabis) | [cannabis.openship.org](https://cannabis.openship.org) | [Docs](https://docs.openship.org/docs/openfront/cannabis) |
| Openfront Pharmacy | Prescriptions, inventory lots and pickup | [openfront-pharmacy](https://github.com/openshiporg/openfront-pharmacy) | [pharmacy.openship.org](https://pharmacy.openship.org) | [Docs](https://docs.openship.org/docs/openfront/pharmacy) |
| Openfront Med Spa | Treatments, consents and memberships | [openfront-medspa](https://github.com/openshiporg/openfront-medspa) | [medspa.openship.org](https://medspa.openship.org) | [Docs](https://docs.openship.org/docs/openfront/medspa) |
| Openfront Construction | Projects, bids, change orders and crews | [openfront-construction](https://github.com/openshiporg/openfront-construction) | [construction.openship.org](https://construction.openship.org) | [Docs](https://docs.openship.org/docs/openfront/construction) |
| Openfront Law Firm | Matters, intake, time and billing | [openfront-law-firm](https://github.com/openshiporg/openfront-law-firm) | [law-firm.openship.org](https://law-firm.openship.org) | [Docs](https://docs.openship.org/docs/openfront/law-firm) |
| **Openfront Comedy Club** (this repository) | Shows, lineups, table seating, door check-in and nightly settlement | [openfront-comedy-club](https://github.com/openshiporg/openfront-comedy-club) | [comedy-club.openship.org](https://comedy-club.openship.org) | [Docs](https://docs.openship.org/docs/openfront/comedy-club) |
| Openfront Rideshare | Rides, drivers and dispatch | [openfront-rideshare](https://github.com/openshiporg/openfront-rideshare) | [rideshare.openship.org](https://rideshare.openship.org) | [Docs](https://docs.openship.org/docs/openfront/rideshare) |
| Openfront Airline | Flights, booking and passenger operations | [openfront-airline](https://github.com/openshiporg/openfront-airline) | [airline.openship.org](https://airline.openship.org) | [Docs](https://docs.openship.org/docs/openfront/airline) |
| Openfront Hospital | Appointments, patients and care teams | [openfront-hospital](https://github.com/openshiporg/openfront-hospital) | [hospital.openship.org](https://hospital.openship.org) | [Docs](https://docs.openship.org/docs/openfront/hospital) |
| Openfront Sportsbook | Markets, bets and results | [openfront-sportsbook](https://github.com/openshiporg/openfront-sportsbook) | [sportsbook.openship.org](https://sportsbook.openship.org) | [Docs](https://docs.openship.org/docs/openfront/sportsbook) |
| Openship | Order routing from sales channels to fulfillment | [openship](https://github.com/openshiporg/openship) | [os.openship.org](https://os.openship.org) | [Docs](https://docs.openship.org/docs/openship/ecommerce) |
| Marketplace | Shop across Openfront stores | [marketplace](https://github.com/openshiporg/marketplace) | [marketplace.openship.org](https://marketplace.openship.org) | [Docs](https://docs.openship.org/docs/openfront/marketplace) |
