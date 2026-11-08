-- Rules the app already relied on, now enforced by the database. Live data was checked read-only first: 0 violations.

-- Capacity: sold + held never pass a tier's capacity, and nothing goes negative.
ALTER TABLE "PriceTier"
  ADD CONSTRAINT "PriceTier_counts_valid" CHECK ("sold" >= 0 AND "held" >= 0 AND "capacity" >= 0 AND "sold" + "held" <= "capacity"),
  ADD CONSTRAINT "PriceTier_amounts_valid" CHECK ("priceCents" >= 0 AND "feeCents" >= 0 AND "seatsPerUnit" >= 1),
  ADD CONSTRAINT "PriceTier_sale_window" CHECK ("salesStartAt" IS NULL OR "salesEndAt" IS NULL OR "salesStartAt" < "salesEndAt");

-- Time
ALTER TABLE "Show"
  ADD CONSTRAINT "Show_time_order" CHECK (("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt") AND ("doorsAt" IS NULL OR "startsAt" IS NULL OR "doorsAt" <= "startsAt")),
  ADD CONSTRAINT "Show_capacity_non_negative" CHECK ("capacity" >= 0);
ALTER TABLE "Run" ADD CONSTRAINT "Run_time_order" CHECK ("startAt" IS NULL OR "endAt" IS NULL OR "endAt" > "startAt"),
  ADD CONSTRAINT "Run_fee_non_negative" CHECK ("runFeeCents" >= 0);
ALTER TABLE "ShowTemplate" ADD CONSTRAINT "ShowTemplate_duration_positive" CHECK ("duration" > 0);
ALTER TABLE "Room" ADD CONSTRAINT "Room_capacity_non_negative" CHECK ("capacity" >= 0);
ALTER TABLE "Table" ADD CONSTRAINT "Table_seats_positive" CHECK ("seats" >= 1);

-- Venue and settings
ALTER TABLE "Venue"
  ADD CONSTRAINT "Venue_rates_valid" CHECK ("serviceFeeBps" BETWEEN 0 AND 10000 AND "taxBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "Venue_minimum_valid" CHECK ("drinkMinimumItems" >= 0 AND "drinkMinimumCentsFloor" >= 0);
ALTER TABLE "VenueSettings"
  ADD CONSTRAINT "VenueSettings_ranges" CHECK ("holdMinutes" BETWEEN 1 AND 240 AND "refundWindowHours" BETWEEN 0 AND 8760 AND "approvalThresholdCents" >= 0 AND "compApprovalQuantity" >= 1),
  ADD CONSTRAINT "VenueSettings_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');

CREATE FUNCTION comedy_venue_timezone_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM now() AT TIME ZONE NEW."timezone";
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Venue_timezone_valid: % is not a time zone', NEW."timezone" USING ERRCODE = '23514';
  END;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Venue_timezone_valid" BEFORE INSERT OR UPDATE OF "timezone" ON "Venue"
  FOR EACH ROW EXECUTE FUNCTION comedy_venue_timezone_valid();

-- Money
ALTER TABLE "TicketOrder"
  ADD CONSTRAINT "TicketOrder_amounts_balance" CHECK ("subtotalCents" >= 0 AND "feesCents" >= 0 AND "discountCents" >= 0 AND "taxCents" >= 0 AND "totalCents" = "subtotalCents" + "feesCents" - "discountCents" + "taxCents"),
  ADD CONSTRAINT "TicketOrder_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "TicketOrder_party_size" CHECK ("partySize" >= 1);
ALTER TABLE "TicketOrderLine"
  ADD CONSTRAINT "TicketOrderLine_amounts_valid" CHECK ("quantity" >= 1 AND "unitPriceCents" >= 0 AND "unitFeeCents" >= 0 AND "lineTotalCents" >= 0 AND "discountCents" >= 0 AND "taxCents" >= 0),
  ADD CONSTRAINT "TicketOrderLine_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amounts_valid" CHECK ("amount" > 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "amount" AND ("tipAmount" IS NULL OR ("tipAmount" >= 0 AND "tipAmount" <= "amount"))),
  ADD CONSTRAINT "Payment_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "Refund_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Check"
  ADD CONSTRAINT "Check_amounts_balance" CHECK ("minimumShortfallCents" >= 0 AND "minimumUnitPriceCents" >= 0 AND "minimumCentsFloor" >= 0 AND "subtotalCents" >= 0 AND "taxCents" >= 0 AND "tipCents" >= 0 AND "totalCents" = "subtotalCents" + "taxCents" + "tipCents"),
  ADD CONSTRAINT "Check_tax_rate" CHECK ("taxBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "Check_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "CheckItem" ADD CONSTRAINT "CheckItem_amounts_valid" CHECK ("qty" >= 1 AND "priceCents" >= 0);
ALTER TABLE "LineupSlot" ADD CONSTRAINT "LineupSlot_amounts_valid" CHECK ("feeCents" >= 0 AND "bonusCents" >= 0 AND "setMinutes" > 0 AND "position" >= 0);
ALTER TABLE "ComedianPayout"
  ADD CONSTRAINT "ComedianPayout_amount_non_negative" CHECK ("amountCents" >= 0),
  ADD CONSTRAINT "ComedianPayout_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Comp" ADD CONSTRAINT "Comp_quantity_positive" CHECK ("quantity" >= 1);
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_party_size" CHECK ("partySize" >= 1);
ALTER TABLE "PromoCode"
  ADD CONSTRAINT "PromoCode_value_valid" CHECK ("value" >= 0 AND ("discountType"::text <> 'percent_bps' OR "value" <= 10000)),
  ADD CONSTRAINT "PromoCode_uses_valid" CHECK ("maxUses" >= 0 AND "usedCount" >= 0 AND ("maxUses" IS NULL OR "usedCount" <= "maxUses")),
  ADD CONSTRAINT "PromoCode_window" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt");

-- Refunds never exceed the payment, in the payment's currency. The payment row is locked so two concurrent refunds
-- are counted one after the other. Prisma drops the constraint name from trigger errors, so the rule name leads the message.
CREATE FUNCTION comedy_refund_within_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  paid RECORD;
  refunded BIGINT;
BEGIN
  IF NEW."payment" IS NULL THEN RETURN NULL; END IF;
  SELECT "amount", "currencyCode" INTO paid FROM "Payment" WHERE "id" = NEW."payment" FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NEW."currencyCode" <> paid."currencyCode" THEN
    RAISE EXCEPTION 'Refund_within_payment: refund currency % differs from payment currency %', NEW."currencyCode", paid."currencyCode" USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(SUM("amount"), 0) INTO refunded FROM "Refund"
    WHERE "payment" = NEW."payment" AND "status" IN ('processing', 'unknown', 'succeeded');
  IF refunded > paid."amount" THEN
    RAISE EXCEPTION 'Refund_within_payment: refunds % exceed payment %', refunded, paid."amount" USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "Refund_within_payment"
  AFTER INSERT OR UPDATE OF "amount", "status", "payment", "currencyCode" ON "Refund"
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION comedy_refund_within_payment();

-- Uniqueness
-- Expression indexes (case-insensitive): Prisma ignores them, so a generated migration will not drop them.
CREATE UNIQUE INDEX "Room_venue_name_key" ON "Room"("venue", lower("name"));
CREATE UNIQUE INDEX "Section_room_name_key" ON "Section"("room", lower("name"));
CREATE UNIQUE INDEX "Table_section_label_key" ON "Table"("section", lower("label"));
CREATE UNIQUE INDEX "WaitlistEntry_one_active_per_show_email" ON "WaitlistEntry"("show", "email") WHERE "status" IN ('waiting', 'offered');
CREATE UNIQUE INDEX "LineupSlot_one_host_headliner_per_show" ON "LineupSlot"("show", "role") WHERE "role" IN ('host', 'headliner') AND "status" NOT IN ('cancelled', 'declined');
CREATE UNIQUE INDEX "LineupSlot_one_active_per_show_comedian" ON "LineupSlot"("show", "comedian") WHERE "status" NOT IN ('cancelled', 'declined');
CREATE UNIQUE INDEX "Check_one_open_per_seating" ON "Check"("seatingAssignment") WHERE "status" IN ('open', 'presented');
CREATE UNIQUE INDEX "Payment_one_live_per_check" ON "Payment"("check") WHERE "check" IS NOT NULL AND "status" IN ('pending', 'processing', 'authorized', 'unknown', 'succeeded');
CREATE UNIQUE INDEX "Payment_provider_reference_key" ON "Payment"("providerPaymentId") WHERE "providerPaymentId" <> '';
