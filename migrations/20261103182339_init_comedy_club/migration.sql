-- CreateEnum
CREATE TYPE "CheckStatusType" AS ENUM ('open', 'presented', 'paid', 'voided');

-- CreateEnum
CREATE TYPE "CheckInMethodType" AS ENUM ('scan', 'manual');

-- CreateEnum
CREATE TYPE "CheckInResultType" AS ENUM ('admitted', 'duplicate', 'wrong_show', 'void');

-- CreateEnum
CREATE TYPE "ComedianStatusType" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "ComedianPayoutStatusType" AS ENUM ('draft', 'approved', 'paid', 'void');

-- CreateEnum
CREATE TYPE "ComedianPayoutMethodType" AS ENUM ('check', 'ach', 'venmo');

-- CreateEnum
CREATE TYPE "CompReasonType" AS ENUM ('industry', 'comic_guest', 'press', 'service_recovery');

-- CreateEnum
CREATE TYPE "InventoryHoldStatusType" AS ENUM ('active', 'converted', 'released', 'expired');

-- CreateEnum
CREATE TYPE "LineupSlotRoleType" AS ENUM ('host', 'opener', 'guest_set', 'feature', 'headliner', 'bringer');

-- CreateEnum
CREATE TYPE "LineupSlotStatusType" AS ENUM ('offered', 'confirmed', 'declined', 'cancelled', 'performed', 'no_show');

-- CreateEnum
CREATE TYPE "MenuItemCategoryType" AS ENUM ('drink', 'food', 'na');

-- CreateEnum
CREATE TYPE "OpenMicSignupMethodType" AS ENUM ('online_list', 'bucket', 'bringer');

-- CreateEnum
CREATE TYPE "OpenMicSignupStatusType" AS ENUM ('waiting', 'called', 'performed', 'skipped', 'withdrawn');

-- CreateEnum
CREATE TYPE "PaymentCollectionDescriptionType" AS ENUM ('default', 'refund');

-- CreateEnum
CREATE TYPE "PriceTierStatusType" AS ENUM ('on_sale', 'paused', 'sold_out', 'closed');

-- CreateEnum
CREATE TYPE "PromoCodeDiscountTypeType" AS ENUM ('percent_bps', 'amount_cents', 'comp');

-- CreateEnum
CREATE TYPE "PromoCodeStatusType" AS ENUM ('active', 'paused', 'expired');

-- CreateEnum
CREATE TYPE "PromoRedemptionStatusType" AS ENUM ('reserved', 'committed', 'released');

-- CreateEnum
CREATE TYPE "RoomSeatingModeType" AS ENUM ('tables', 'ga');

-- CreateEnum
CREATE TYPE "SeatingAssignmentStatusType" AS ENUM ('unseated', 'seated', 'closed');

-- CreateEnum
CREATE TYPE "ShowStatusType" AS ENUM ('draft', 'on_sale', 'sold_out', 'doors_open', 'in_progress', 'completed', 'settled', 'cancelled');

-- CreateEnum
CREATE TYPE "ShowSettlementStatusType" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "TableShapeType" AS ENUM ('round', 'square', 'rectangle');

-- CreateEnum
CREATE TYPE "TicketStatusType" AS ENUM ('valid', 'checked_in', 'void', 'refunded');

-- CreateEnum
CREATE TYPE "TicketOrderStatusType" AS ENUM ('pending_payment', 'paid', 'partially_refunded', 'refunded', 'cancelled', 'comp');

-- CreateEnum
CREATE TYPE "TicketOrderSourceType" AS ENUM ('online', 'box_office', 'comp', 'bringer');

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actor" TEXT,
    "action" TEXT NOT NULL DEFAULT '',
    "targetList" TEXT NOT NULL DEFAULT '',
    "targetId" TEXT NOT NULL DEFAULT '',
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT NOT NULL DEFAULT '',
    "requestId" TEXT NOT NULL DEFAULT '',
    "eventKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Check" (
    "id" TEXT NOT NULL,
    "show" TEXT,
    "seatingAssignment" TEXT,
    "server" TEXT,
    "status" "CheckStatusType" DEFAULT 'open',
    "guestCount" INTEGER DEFAULT 1,
    "minimumItemsRequired" INTEGER DEFAULT 2,
    "minimumShortfallCents" INTEGER DEFAULT 0,
    "minimumUnitPriceCents" INTEGER DEFAULT 0,
    "minimumCentsFloor" INTEGER DEFAULT 0,
    "subtotalCents" INTEGER DEFAULT 0,
    "taxBps" INTEGER DEFAULT 0,
    "taxCents" INTEGER DEFAULT 0,
    "tipCents" INTEGER DEFAULT 0,
    "totalCents" INTEGER DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "ticket" TEXT,
    "show" TEXT,
    "scannedBy" TEXT,
    "at" TIMESTAMP(3),
    "method" "CheckInMethodType" DEFAULT 'scan',
    "result" "CheckInResultType" DEFAULT 'admitted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckItem" (
    "id" TEXT NOT NULL,
    "check" TEXT,
    "menuItem" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER DEFAULT 0,
    "qty" INTEGER DEFAULT 1,
    "countsTowardMinimum" BOOLEAN NOT NULL DEFAULT false,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT NOT NULL DEFAULT '',
    "approval" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comedian" (
    "id" TEXT NOT NULL,
    "stageName" TEXT NOT NULL DEFAULT '',
    "legalName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "headshot_id" TEXT,
    "headshot_filesize" INTEGER,
    "headshot_width" INTEGER,
    "headshot_height" INTEGER,
    "headshot_extension" TEXT,
    "socials" JSONB,
    "homeCity" TEXT NOT NULL DEFAULT '',
    "defaultFeeCents" INTEGER DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "payeeDetailsOnFile" BOOLEAN NOT NULL DEFAULT false,
    "status" "ComedianStatusType" DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comedian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComedianPayout" (
    "id" TEXT NOT NULL,
    "comedian" TEXT,
    "show" TEXT,
    "run" TEXT,
    "amountCents" INTEGER DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "status" "ComedianPayoutStatusType" DEFAULT 'draft',
    "paidAt" TIMESTAMP(3),
    "method" "ComedianPayoutMethodType" DEFAULT 'check',
    "reference" TEXT NOT NULL DEFAULT '',
    "payoutKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComedianPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comp" (
    "id" TEXT NOT NULL,
    "show" TEXT,
    "issuedBy" TEXT,
    "recipientName" TEXT NOT NULL DEFAULT '',
    "recipientEmail" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER DEFAULT 1,
    "reason" "CompReasonType" DEFAULT 'industry',
    "approval" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "requestMethod" TEXT NOT NULL DEFAULT '',
    "requestParams" JSONB,
    "requestPath" TEXT NOT NULL DEFAULT '',
    "responseCode" INTEGER,
    "responseBody" JSONB,
    "recoveryPoint" TEXT NOT NULL DEFAULT 'started',
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryHold" (
    "id" TEXT NOT NULL,
    "holdKey" TEXT NOT NULL DEFAULT '',
    "show" TEXT,
    "priceTier" TEXT,
    "quantity" INTEGER DEFAULT 1,
    "status" "InventoryHoldStatusType" DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "cartToken" TEXT NOT NULL DEFAULT '',
    "quote" JSONB,
    "promo" TEXT,
    "redemption" TEXT,
    "order" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineupSlot" (
    "id" TEXT NOT NULL,
    "show" TEXT,
    "comedian" TEXT,
    "role" "LineupSlotRoleType" DEFAULT 'host',
    "position" INTEGER DEFAULT 0,
    "setMinutes" INTEGER DEFAULT 10,
    "feeCents" INTEGER DEFAULT 0,
    "bonusCents" INTEGER DEFAULT 0,
    "status" "LineupSlotStatusType" DEFAULT 'offered',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineupSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerApproval" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER,
    "requestFingerprint" TEXT NOT NULL DEFAULT '',
    "requestPayload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedEntityType" TEXT NOT NULL DEFAULT '',
    "consumedEntityId" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "category" "MenuItemCategoryType" DEFAULT 'drink',
    "priceCents" INTEGER DEFAULT 0,
    "countsTowardMinimum" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "image_id" TEXT,
    "image_filesize" INTEGER,
    "image_width" INTEGER,
    "image_height" INTEGER,
    "image_extension" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthApp" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL DEFAULT '',
    "clientSecret" TEXT NOT NULL DEFAULT '',
    "tokenEndpointAuthMethod" TEXT DEFAULT 'client_secret_post',
    "redirectUris" JSONB DEFAULT '[]',
    "scopes" JSONB DEFAULT '["mcp:read","mcp:write"]',
    "webhookUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'active',
    "installUrl" TEXT NOT NULL DEFAULT '',
    "uninstallUrl" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB DEFAULT '{}',
    "developerEmail" TEXT NOT NULL DEFAULT '',
    "privacyPolicyUrl" TEXT NOT NULL DEFAULT '',
    "termsOfServiceUrl" TEXT NOT NULL DEFAULT '',
    "supportUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL DEFAULT '',
    "user" TEXT,
    "scopes" JSONB DEFAULT '[]',
    "redirectUri" TEXT NOT NULL DEFAULT '',
    "resource" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "isRevoked" TEXT DEFAULT 'false',
    "authorizationCode" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "codeChallenge" TEXT NOT NULL DEFAULT '',
    "codeChallengeMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenMicSignup" (
    "id" TEXT NOT NULL,
    "signupKey" TEXT NOT NULL DEFAULT '',
    "show" TEXT,
    "comedian" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "method" "OpenMicSignupMethodType" DEFAULT 'online_list',
    "lotteryNumber" INTEGER DEFAULT 0,
    "status" "OpenMicSignupStatusType" DEFAULT 'waiting',
    "bringerGuestsRequired" INTEGER DEFAULT 0,
    "bringerGuestsArrived" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpenMicSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "reservedAt" TIMESTAMP(3),
    "refundedAmount" INTEGER DEFAULT 0,
    "amount" INTEGER NOT NULL,
    "data" JSONB,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT DEFAULT 'credit_card',
    "paymentProvider" TEXT,
    "providerPaymentId" TEXT NOT NULL DEFAULT '',
    "cardLast4" TEXT NOT NULL DEFAULT '',
    "cardBrand" TEXT NOT NULL DEFAULT '',
    "tipAmount" INTEGER DEFAULT 0,
    "isSplitPayment" BOOLEAN NOT NULL DEFAULT false,
    "splitPaymentIndex" INTEGER,
    "splitTotal" INTEGER,
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "order" TEXT,
    "paymentCollection" TEXT,
    "check" TEXT,
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCollection" (
    "id" TEXT NOT NULL,
    "description" "PaymentCollectionDescriptionType" DEFAULT 'default',
    "amount" INTEGER NOT NULL,
    "authorizedAmount" INTEGER DEFAULT 0,
    "refundedAmount" INTEGER DEFAULT 0,
    "metadata" JSONB,
    "order" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "isInstalled" BOOLEAN NOT NULL DEFAULT true,
    "credentials" JSONB DEFAULT '{}',
    "metadata" JSONB DEFAULT '{}',
    "createPaymentFunction" TEXT NOT NULL DEFAULT '',
    "capturePaymentFunction" TEXT NOT NULL DEFAULT '',
    "refundPaymentFunction" TEXT NOT NULL DEFAULT '',
    "getPaymentStatusFunction" TEXT NOT NULL DEFAULT '',
    "generatePaymentLinkFunction" TEXT NOT NULL DEFAULT '',
    "handleWebhookFunction" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSession" (
    "id" TEXT NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "isInitiated" BOOLEAN NOT NULL DEFAULT false,
    "amount" INTEGER NOT NULL,
    "data" JSONB DEFAULT '{}',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "paymentCollection" TEXT,
    "paymentProvider" TEXT,
    "paymentAuthorizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "providerCode" TEXT NOT NULL DEFAULT '',
    "providerEventId" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'received',
    "payload" JSONB,
    "rawBody" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "attempts" INTEGER DEFAULT 0,
    "receivedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "payment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceTier" (
    "id" TEXT NOT NULL,
    "show" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER DEFAULT 0,
    "feeCents" INTEGER DEFAULT 0,
    "capacity" INTEGER DEFAULT 180,
    "sold" INTEGER DEFAULT 0,
    "held" INTEGER DEFAULT 0,
    "isTableTier" BOOLEAN NOT NULL DEFAULT false,
    "seatsPerUnit" INTEGER DEFAULT 1,
    "salesStartAt" TIMESTAMP(3),
    "salesEndAt" TIMESTAMP(3),
    "status" "PriceTierStatusType" DEFAULT 'on_sale',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "discountType" "PromoCodeDiscountTypeType" DEFAULT 'percent_bps',
    "value" INTEGER DEFAULT 0,
    "maxUses" INTEGER,
    "usedCount" INTEGER DEFAULT 0,
    "perOrderLimit" INTEGER DEFAULT 1,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" "PromoCodeStatusType" DEFAULT 'active',
    "show" TEXT,
    "template" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL,
    "promoCode" TEXT,
    "order" TEXT,
    "amountCents" INTEGER DEFAULT 0,
    "status" "PromoRedemptionStatusType" DEFAULT 'reserved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'processing',
    "reason" TEXT NOT NULL DEFAULT '',
    "providerRefundId" TEXT NOT NULL DEFAULT '',
    "providerData" JSONB,
    "processedAt" TIMESTAMP(3),
    "payment" TEXT,
    "order" TEXT,
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "canSeeOtherPeople" BOOLEAN NOT NULL DEFAULT false,
    "canEditOtherPeople" BOOLEAN NOT NULL DEFAULT false,
    "canManagePeople" BOOLEAN NOT NULL DEFAULT false,
    "canManageRoles" BOOLEAN NOT NULL DEFAULT false,
    "canAccessDashboard" BOOLEAN NOT NULL DEFAULT false,
    "canManageOnboarding" BOOLEAN NOT NULL DEFAULT false,
    "canManagePayments" BOOLEAN NOT NULL DEFAULT false,
    "canReadPayments" BOOLEAN NOT NULL DEFAULT false,
    "canIssueRefunds" BOOLEAN NOT NULL DEFAULT false,
    "canReadAudit" BOOLEAN NOT NULL DEFAULT false,
    "canManageShows" BOOLEAN NOT NULL DEFAULT false,
    "canManageTalent" BOOLEAN NOT NULL DEFAULT false,
    "canManageDoor" BOOLEAN NOT NULL DEFAULT false,
    "canManageChecks" BOOLEAN NOT NULL DEFAULT false,
    "canManagePayouts" BOOLEAN NOT NULL DEFAULT false,
    "canManageSettings" BOOLEAN NOT NULL DEFAULT false,
    "canManageOrders" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "venue" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER DEFAULT 180,
    "seatingMode" "RoomSeatingModeType" DEFAULT 'tables',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "headliner" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "runFeeCents" INTEGER DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatingAssignment" (
    "id" TEXT NOT NULL,
    "show" TEXT,
    "ticketOrder" TEXT,
    "partySize" INTEGER DEFAULT 1,
    "status" "SeatingAssignmentStatusType" DEFAULT 'unseated',
    "seatedAt" TIMESTAMP(3),
    "server" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "room" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "priceTier" TEXT,
    "sort" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Show" (
    "id" TEXT NOT NULL,
    "room" TEXT,
    "template" TEXT,
    "run" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "occurrenceKey" TEXT NOT NULL DEFAULT '',
    "startsAt" TIMESTAMP(3),
    "doorsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "signupOpensAt" TIMESTAMP(3),
    "ageRestriction" TEXT DEFAULT 'all',
    "capacity" INTEGER DEFAULT 180,
    "status" "ShowStatusType" DEFAULT 'draft',
    "isOpenMic" BOOLEAN NOT NULL DEFAULT false,
    "publicNote" TEXT NOT NULL DEFAULT '',
    "settlement" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Show_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowSettlement" (
    "id" TEXT NOT NULL,
    "ticketGrossCents" INTEGER DEFAULT 0,
    "feesCents" INTEGER DEFAULT 0,
    "discountsCents" INTEGER DEFAULT 0,
    "refundsCents" INTEGER DEFAULT 0,
    "compsCount" INTEGER DEFAULT 0,
    "foodBeverageGrossCents" INTEGER DEFAULT 0,
    "minimumShortfallRevenueCents" INTEGER DEFAULT 0,
    "tipsCents" INTEGER DEFAULT 0,
    "talentCostCents" INTEGER DEFAULT 0,
    "netCents" INTEGER DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "status" "ShowSettlementStatusType" DEFAULT 'open',
    "closedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowTemplate" (
    "id" TEXT NOT NULL,
    "room" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "recurrenceRule" TEXT NOT NULL DEFAULT '',
    "startTime" TEXT NOT NULL DEFAULT '',
    "duration" INTEGER DEFAULT 90,
    "defaultAgeRestriction" TEXT DEFAULT 'all',
    "isOpenMic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "section" TEXT,
    "label" TEXT NOT NULL DEFAULT '',
    "seats" INTEGER DEFAULT 4,
    "x" INTEGER DEFAULT 0,
    "y" INTEGER DEFAULT 0,
    "shape" "TableShapeType" DEFAULT 'round',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableOccupancy" (
    "id" TEXT NOT NULL,
    "occupancyKey" TEXT,
    "show" TEXT,
    "table" TEXT,
    "hold" TEXT,
    "assignment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableOccupancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "order" TEXT,
    "show" TEXT,
    "line" TEXT,
    "ticketCode" TEXT NOT NULL DEFAULT '',
    "tokenHash" TEXT NOT NULL DEFAULT '',
    "holderName" TEXT NOT NULL DEFAULT '',
    "status" "TicketStatusType" DEFAULT 'valid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL DEFAULT '',
    "customer" TEXT,
    "email" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "show" TEXT,
    "status" "TicketOrderStatusType" DEFAULT 'pending_payment',
    "subtotalCents" INTEGER DEFAULT 0,
    "feesCents" INTEGER DEFAULT 0,
    "discountCents" INTEGER DEFAULT 0,
    "taxCents" INTEGER DEFAULT 0,
    "totalCents" INTEGER DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "source" "TicketOrderSourceType" DEFAULT 'online',
    "partySize" INTEGER DEFAULT 1,
    "seatingRequest" TEXT NOT NULL DEFAULT '',
    "birthdayOrOccasion" TEXT NOT NULL DEFAULT '',
    "ageAttested" BOOLEAN NOT NULL DEFAULT false,
    "secretKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketOrderLine" (
    "id" TEXT NOT NULL,
    "order" TEXT,
    "tierName" TEXT NOT NULL DEFAULT '',
    "unitPriceCents" INTEGER DEFAULT 0,
    "unitFeeCents" INTEGER DEFAULT 0,
    "quantity" INTEGER DEFAULT 1,
    "lineTotalCents" INTEGER DEFAULT 0,
    "discountCents" INTEGER DEFAULT 0,
    "taxCents" INTEGER DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "priceTierId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL,
    "role" TEXT,
    "onboardingStatus" TEXT DEFAULT 'not_started',
    "notificationPreference" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordResetToken" TEXT,
    "passwordResetIssuedAt" TIMESTAMP(3),
    "passwordResetRedeemedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "defaultAgeRestriction" TEXT DEFAULT 'all',
    "drinkMinimumItems" INTEGER DEFAULT 2,
    "drinkMinimumCentsFloor" INTEGER DEFAULT 0,
    "serviceFeeBps" INTEGER DEFAULT 0,
    "taxBps" INTEGER DEFAULT 0,
    "policies" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueSettings" (
    "id" INTEGER NOT NULL,
    "refundWindowHours" INTEGER DEFAULT 24,
    "holdMinutes" INTEGER DEFAULT 10,
    "approvalThresholdCents" INTEGER DEFAULT 10000,
    "compApprovalQuantity" INTEGER DEFAULT 4,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ComedianPayout_lineupSlots" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_InventoryHold_tables" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_PriceTier_templates" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_SeatingAssignment_tables" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_Table_combinableWith" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_eventKey_key" ON "AuditEvent"("eventKey");

-- CreateIndex
CREATE INDEX "AuditEvent_actor_idx" ON "AuditEvent"("actor");

-- CreateIndex
CREATE INDEX "Check_show_idx" ON "Check"("show");

-- CreateIndex
CREATE INDEX "Check_seatingAssignment_idx" ON "Check"("seatingAssignment");

-- CreateIndex
CREATE INDEX "Check_server_idx" ON "Check"("server");

-- CreateIndex
CREATE INDEX "CheckIn_ticket_idx" ON "CheckIn"("ticket");

-- CreateIndex
CREATE INDEX "CheckIn_show_idx" ON "CheckIn"("show");

-- CreateIndex
CREATE INDEX "CheckIn_scannedBy_idx" ON "CheckIn"("scannedBy");

-- CreateIndex
CREATE INDEX "CheckItem_check_idx" ON "CheckItem"("check");

-- CreateIndex
CREATE INDEX "CheckItem_menuItem_idx" ON "CheckItem"("menuItem");

-- CreateIndex
CREATE INDEX "CheckItem_approval_idx" ON "CheckItem"("approval");

-- CreateIndex
CREATE UNIQUE INDEX "ComedianPayout_payoutKey_key" ON "ComedianPayout"("payoutKey");

-- CreateIndex
CREATE INDEX "ComedianPayout_comedian_idx" ON "ComedianPayout"("comedian");

-- CreateIndex
CREATE INDEX "ComedianPayout_show_idx" ON "ComedianPayout"("show");

-- CreateIndex
CREATE INDEX "ComedianPayout_run_idx" ON "ComedianPayout"("run");

-- CreateIndex
CREATE INDEX "Comp_show_idx" ON "Comp"("show");

-- CreateIndex
CREATE INDEX "Comp_issuedBy_idx" ON "Comp"("issuedBy");

-- CreateIndex
CREATE INDEX "Comp_approval_idx" ON "Comp"("approval");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_idempotencyKey_key" ON "IdempotencyKey"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryHold_holdKey_key" ON "InventoryHold"("holdKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryHold_redemption_key" ON "InventoryHold"("redemption");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryHold_order_key" ON "InventoryHold"("order");

-- CreateIndex
CREATE INDEX "InventoryHold_show_idx" ON "InventoryHold"("show");

-- CreateIndex
CREATE INDEX "InventoryHold_priceTier_idx" ON "InventoryHold"("priceTier");

-- CreateIndex
CREATE INDEX "InventoryHold_promo_idx" ON "InventoryHold"("promo");

-- CreateIndex
CREATE INDEX "LineupSlot_show_idx" ON "LineupSlot"("show");

-- CreateIndex
CREATE INDEX "LineupSlot_comedian_idx" ON "LineupSlot"("comedian");

-- CreateIndex
CREATE INDEX "ManagerApproval_actionType_idx" ON "ManagerApproval"("actionType");

-- CreateIndex
CREATE INDEX "ManagerApproval_targetId_idx" ON "ManagerApproval"("targetId");

-- CreateIndex
CREATE INDEX "ManagerApproval_status_idx" ON "ManagerApproval"("status");

-- CreateIndex
CREATE INDEX "ManagerApproval_requestedAt_idx" ON "ManagerApproval"("requestedAt");

-- CreateIndex
CREATE INDEX "ManagerApproval_expiresAt_idx" ON "ManagerApproval"("expiresAt");

-- CreateIndex
CREATE INDEX "ManagerApproval_requestedBy_idx" ON "ManagerApproval"("requestedBy");

-- CreateIndex
CREATE INDEX "ManagerApproval_approvedBy_idx" ON "ManagerApproval"("approvedBy");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthApp_clientId_key" ON "OAuthApp"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_token_key" ON "OAuthToken"("token");

-- CreateIndex
CREATE INDEX "OAuthToken_clientId_idx" ON "OAuthToken"("clientId");

-- CreateIndex
CREATE INDEX "OAuthToken_user_idx" ON "OAuthToken"("user");

-- CreateIndex
CREATE UNIQUE INDEX "OpenMicSignup_signupKey_key" ON "OpenMicSignup"("signupKey");

-- CreateIndex
CREATE INDEX "OpenMicSignup_show_idx" ON "OpenMicSignup"("show");

-- CreateIndex
CREATE INDEX "OpenMicSignup_comedian_idx" ON "OpenMicSignup"("comedian");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_paymentProvider_idx" ON "Payment"("paymentProvider");

-- CreateIndex
CREATE INDEX "Payment_order_idx" ON "Payment"("order");

-- CreateIndex
CREATE INDEX "Payment_paymentCollection_idx" ON "Payment"("paymentCollection");

-- CreateIndex
CREATE INDEX "Payment_check_idx" ON "Payment"("check");

-- CreateIndex
CREATE INDEX "Payment_processedBy_idx" ON "Payment"("processedBy");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCollection_order_key" ON "PaymentCollection"("order");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProvider_code_key" ON "PaymentProvider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_idempotencyKey_key" ON "PaymentSession"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentSession_paymentCollection_idx" ON "PaymentSession"("paymentCollection");

-- CreateIndex
CREATE INDEX "PaymentSession_paymentProvider_idx" ON "PaymentSession"("paymentProvider");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_eventKey_key" ON "PaymentWebhookEvent"("eventKey");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_providerCode_idx" ON "PaymentWebhookEvent"("providerCode");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_providerEventId_idx" ON "PaymentWebhookEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_eventType_idx" ON "PaymentWebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_receivedAt_idx" ON "PaymentWebhookEvent"("receivedAt");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_payment_idx" ON "PaymentWebhookEvent"("payment");

-- CreateIndex
CREATE INDEX "PriceTier_show_idx" ON "PriceTier"("show");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_show_idx" ON "PromoCode"("show");

-- CreateIndex
CREATE INDEX "PromoCode_template_idx" ON "PromoCode"("template");

-- CreateIndex
CREATE INDEX "PromoRedemption_promoCode_idx" ON "PromoRedemption"("promoCode");

-- CreateIndex
CREATE INDEX "PromoRedemption_order_idx" ON "PromoRedemption"("order");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Refund_payment_idx" ON "Refund"("payment");

-- CreateIndex
CREATE INDEX "Refund_order_idx" ON "Refund"("order");

-- CreateIndex
CREATE INDEX "Refund_requestedBy_idx" ON "Refund"("requestedBy");

-- CreateIndex
CREATE INDEX "Refund_approvedBy_idx" ON "Refund"("approvedBy");

-- CreateIndex
CREATE INDEX "Room_venue_idx" ON "Room"("venue");

-- CreateIndex
CREATE INDEX "Run_headliner_idx" ON "Run"("headliner");

-- CreateIndex
CREATE UNIQUE INDEX "SeatingAssignment_ticketOrder_key" ON "SeatingAssignment"("ticketOrder");

-- CreateIndex
CREATE INDEX "SeatingAssignment_show_idx" ON "SeatingAssignment"("show");

-- CreateIndex
CREATE INDEX "SeatingAssignment_server_idx" ON "SeatingAssignment"("server");

-- CreateIndex
CREATE INDEX "Section_room_idx" ON "Section"("room");

-- CreateIndex
CREATE INDEX "Section_priceTier_idx" ON "Section"("priceTier");

-- CreateIndex
CREATE UNIQUE INDEX "Show_occurrenceKey_key" ON "Show"("occurrenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "Show_settlement_key" ON "Show"("settlement");

-- CreateIndex
CREATE INDEX "Show_room_idx" ON "Show"("room");

-- CreateIndex
CREATE INDEX "Show_template_idx" ON "Show"("template");

-- CreateIndex
CREATE INDEX "Show_run_idx" ON "Show"("run");

-- CreateIndex
CREATE INDEX "ShowSettlement_closedBy_idx" ON "ShowSettlement"("closedBy");

-- CreateIndex
CREATE INDEX "ShowTemplate_room_idx" ON "ShowTemplate"("room");

-- CreateIndex
CREATE INDEX "Table_section_idx" ON "Table"("section");

-- CreateIndex
CREATE UNIQUE INDEX "TableOccupancy_occupancyKey_key" ON "TableOccupancy"("occupancyKey");

-- CreateIndex
CREATE INDEX "TableOccupancy_show_idx" ON "TableOccupancy"("show");

-- CreateIndex
CREATE INDEX "TableOccupancy_table_idx" ON "TableOccupancy"("table");

-- CreateIndex
CREATE INDEX "TableOccupancy_hold_idx" ON "TableOccupancy"("hold");

-- CreateIndex
CREATE INDEX "TableOccupancy_assignment_idx" ON "TableOccupancy"("assignment");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketCode_key" ON "Ticket"("ticketCode");

-- CreateIndex
CREATE INDEX "Ticket_order_idx" ON "Ticket"("order");

-- CreateIndex
CREATE INDEX "Ticket_show_idx" ON "Ticket"("show");

-- CreateIndex
CREATE INDEX "Ticket_line_idx" ON "Ticket"("line");

-- CreateIndex
CREATE UNIQUE INDEX "TicketOrder_orderNumber_key" ON "TicketOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "TicketOrder_customer_idx" ON "TicketOrder"("customer");

-- CreateIndex
CREATE INDEX "TicketOrder_show_idx" ON "TicketOrder"("show");

-- CreateIndex
CREATE INDEX "TicketOrderLine_order_idx" ON "TicketOrderLine"("order");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "_ComedianPayout_lineupSlots_AB_unique" ON "_ComedianPayout_lineupSlots"("A", "B");

-- CreateIndex
CREATE INDEX "_ComedianPayout_lineupSlots_B_index" ON "_ComedianPayout_lineupSlots"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_InventoryHold_tables_AB_unique" ON "_InventoryHold_tables"("A", "B");

-- CreateIndex
CREATE INDEX "_InventoryHold_tables_B_index" ON "_InventoryHold_tables"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_PriceTier_templates_AB_unique" ON "_PriceTier_templates"("A", "B");

-- CreateIndex
CREATE INDEX "_PriceTier_templates_B_index" ON "_PriceTier_templates"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_SeatingAssignment_tables_AB_unique" ON "_SeatingAssignment_tables"("A", "B");

-- CreateIndex
CREATE INDEX "_SeatingAssignment_tables_B_index" ON "_SeatingAssignment_tables"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_Table_combinableWith_AB_unique" ON "_Table_combinableWith"("A", "B");

-- CreateIndex
CREATE INDEX "_Table_combinableWith_B_index" ON "_Table_combinableWith"("B");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_seatingAssignment_fkey" FOREIGN KEY ("seatingAssignment") REFERENCES "SeatingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_server_fkey" FOREIGN KEY ("server") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_ticket_fkey" FOREIGN KEY ("ticket") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_scannedBy_fkey" FOREIGN KEY ("scannedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckItem" ADD CONSTRAINT "CheckItem_check_fkey" FOREIGN KEY ("check") REFERENCES "Check"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckItem" ADD CONSTRAINT "CheckItem_menuItem_fkey" FOREIGN KEY ("menuItem") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckItem" ADD CONSTRAINT "CheckItem_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ManagerApproval"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComedianPayout" ADD CONSTRAINT "ComedianPayout_comedian_fkey" FOREIGN KEY ("comedian") REFERENCES "Comedian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComedianPayout" ADD CONSTRAINT "ComedianPayout_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComedianPayout" ADD CONSTRAINT "ComedianPayout_run_fkey" FOREIGN KEY ("run") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comp" ADD CONSTRAINT "Comp_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comp" ADD CONSTRAINT "Comp_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comp" ADD CONSTRAINT "Comp_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ManagerApproval"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_priceTier_fkey" FOREIGN KEY ("priceTier") REFERENCES "PriceTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_promo_fkey" FOREIGN KEY ("promo") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_redemption_fkey" FOREIGN KEY ("redemption") REFERENCES "PromoRedemption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_order_fkey" FOREIGN KEY ("order") REFERENCES "TicketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupSlot" ADD CONSTRAINT "LineupSlot_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupSlot" ADD CONSTRAINT "LineupSlot_comedian_fkey" FOREIGN KEY ("comedian") REFERENCES "Comedian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerApproval" ADD CONSTRAINT "ManagerApproval_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerApproval" ADD CONSTRAINT "ManagerApproval_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMicSignup" ADD CONSTRAINT "OpenMicSignup_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMicSignup" ADD CONSTRAINT "OpenMicSignup_comedian_fkey" FOREIGN KEY ("comedian") REFERENCES "Comedian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_order_fkey" FOREIGN KEY ("order") REFERENCES "TicketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentCollection_fkey" FOREIGN KEY ("paymentCollection") REFERENCES "PaymentCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_check_fkey" FOREIGN KEY ("check") REFERENCES "Check"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_processedBy_fkey" FOREIGN KEY ("processedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCollection" ADD CONSTRAINT "PaymentCollection_order_fkey" FOREIGN KEY ("order") REFERENCES "TicketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_paymentCollection_fkey" FOREIGN KEY ("paymentCollection") REFERENCES "PaymentCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_template_fkey" FOREIGN KEY ("template") REFERENCES "ShowTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoCode_fkey" FOREIGN KEY ("promoCode") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_order_fkey" FOREIGN KEY ("order") REFERENCES "TicketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_order_fkey" FOREIGN KEY ("order") REFERENCES "TicketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_venue_fkey" FOREIGN KEY ("venue") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_headliner_fkey" FOREIGN KEY ("headliner") REFERENCES "Comedian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatingAssignment" ADD CONSTRAINT "SeatingAssignment_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatingAssignment" ADD CONSTRAINT "SeatingAssignment_ticketOrder_fkey" FOREIGN KEY ("ticketOrder") REFERENCES "TicketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatingAssignment" ADD CONSTRAINT "SeatingAssignment_server_fkey" FOREIGN KEY ("server") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_priceTier_fkey" FOREIGN KEY ("priceTier") REFERENCES "PriceTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Show" ADD CONSTRAINT "Show_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Show" ADD CONSTRAINT "Show_template_fkey" FOREIGN KEY ("template") REFERENCES "ShowTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Show" ADD CONSTRAINT "Show_run_fkey" FOREIGN KEY ("run") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Show" ADD CONSTRAINT "Show_settlement_fkey" FOREIGN KEY ("settlement") REFERENCES "ShowSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowSettlement" ADD CONSTRAINT "ShowSettlement_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowTemplate" ADD CONSTRAINT "ShowTemplate_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_section_fkey" FOREIGN KEY ("section") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableOccupancy" ADD CONSTRAINT "TableOccupancy_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableOccupancy" ADD CONSTRAINT "TableOccupancy_table_fkey" FOREIGN KEY ("table") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableOccupancy" ADD CONSTRAINT "TableOccupancy_hold_fkey" FOREIGN KEY ("hold") REFERENCES "InventoryHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableOccupancy" ADD CONSTRAINT "TableOccupancy_assignment_fkey" FOREIGN KEY ("assignment") REFERENCES "SeatingAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_order_fkey" FOREIGN KEY ("order") REFERENCES "TicketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_line_fkey" FOREIGN KEY ("line") REFERENCES "TicketOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_customer_fkey" FOREIGN KEY ("customer") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrderLine" ADD CONSTRAINT "TicketOrderLine_order_fkey" FOREIGN KEY ("order") REFERENCES "TicketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_role_fkey" FOREIGN KEY ("role") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ComedianPayout_lineupSlots" ADD CONSTRAINT "_ComedianPayout_lineupSlots_A_fkey" FOREIGN KEY ("A") REFERENCES "ComedianPayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ComedianPayout_lineupSlots" ADD CONSTRAINT "_ComedianPayout_lineupSlots_B_fkey" FOREIGN KEY ("B") REFERENCES "LineupSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InventoryHold_tables" ADD CONSTRAINT "_InventoryHold_tables_A_fkey" FOREIGN KEY ("A") REFERENCES "InventoryHold"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InventoryHold_tables" ADD CONSTRAINT "_InventoryHold_tables_B_fkey" FOREIGN KEY ("B") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PriceTier_templates" ADD CONSTRAINT "_PriceTier_templates_A_fkey" FOREIGN KEY ("A") REFERENCES "PriceTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PriceTier_templates" ADD CONSTRAINT "_PriceTier_templates_B_fkey" FOREIGN KEY ("B") REFERENCES "ShowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SeatingAssignment_tables" ADD CONSTRAINT "_SeatingAssignment_tables_A_fkey" FOREIGN KEY ("A") REFERENCES "SeatingAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SeatingAssignment_tables" ADD CONSTRAINT "_SeatingAssignment_tables_B_fkey" FOREIGN KEY ("B") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Table_combinableWith" ADD CONSTRAINT "_Table_combinableWith_A_fkey" FOREIGN KEY ("A") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Table_combinableWith" ADD CONSTRAINT "_Table_combinableWith_B_fkey" FOREIGN KEY ("B") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
