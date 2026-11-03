# Reuse decisions

Batch 7 DESIGN and CONVENTIONS are authoritative. Catalog paths have moved to `../fleet-docs/OPENFRONT-FEATURES-{CATALOG,SOURCE-INDEX}.md`.

- C01/C02: inspected Restaurant `models/{PaymentProvider,PaymentCollection,PaymentSession,Payment,Refund,PaymentWebhookEvent,IdempotencyKey}.ts`, `integrations/payment/{index,stripe,manual}.ts`, `utils/{paymentProviderAdapter,paymentProviderConfig,paymentState,providerRefunds,checkoutReservation,checkoutProviderObservation}.ts`, and `mutations/handlePaymentProviderWebhook.ts`. Reuse provider models/executor; adapt Cart/RestaurantOrder references to ticket holds/orders. Preserve frozen quotes, original attempt identity, verified amount/currency, unknown outcomes, raw-body signatures, and durable inbox dedupe. Stripe SDK dependency requires lead approval.
- C13/C19: inspected Restaurant `utils/{cartProof,cartAccess,cartMutationTransaction,idempotency}.ts`. Reuse fingerprint helpers unchanged, extract guest token ownership and reserve-before-provider patterns. Raw drafts remain private; proof authorizes only custom operations.
- C16: inspected Gym `mutations/classCapacity.ts` and Airline `models/{InventoryBucket,InventoryHold,SeatAssignment}.ts`. Adapt advisory transaction locks and sold/held counters to show/tier capacity, nullable unique occupancy keys to tables. All capacity writers must share show locks.
- C20: inspected Restaurant `utils/audit.ts` and `models/ManagerApproval.ts`. Adapt event envelope to required action/target fields; append-only raw access. Independent approval binds action/target/amount/reason fingerprint and expires before one-time consumption.
- C28: inspected Restaurant `models/{Table,Section}.ts`. Adapt floor coordinates and section/table relationships; no restaurant domain imported.
- C35: Restaurant onboarding structure will be reused, with comedy-specific ordered seed phases and full/minimal data.

Core 6.5 / Prisma 6.5 remain pinned. Source inspection is not runtime evidence. Tests, migrations, onboarding, screenshots, and provider TEST checkout are separate acceptance gates; none are claimed by this note.
