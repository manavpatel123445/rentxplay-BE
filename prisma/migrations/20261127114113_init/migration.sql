-- Extensions (hand-written). citext: case-insensitive email. btree_gist: lets the
-- no-double-booking exclusion constraint mix "=" on item_id with "&&" on date ranges.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "kyc_status" AS ENUM ('none', 'pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "item_status" AS ENUM ('draft', 'pending_review', 'live', 'paused', 'rejected');

-- CreateEnum
CREATE TYPE "item_condition" AS ENUM ('like_new', 'good', 'fair');

-- CreateEnum
CREATE TYPE "handover" AS ENUM ('pickup', 'delivery');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('requested', 'approved', 'paid', 'picked_up', 'returned', 'completed', 'rejected', 'expired', 'cancelled', 'disputed');

-- CreateEnum
CREATE TYPE "payment_kind" AS ENUM ('charge', 'refund', 'deposit_refund', 'deposit_claim');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('created', 'pending', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "photo_stage" AS ENUM ('pickup', 'return');

-- CreateEnum
CREATE TYPE "dispute_status" AS ENUM ('open', 'resolved');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_verified_at" TIMESTAMPTZ(6),
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'user',
    "kyc_status" "kyc_status" NOT NULL DEFAULT 'none',
    "avatar_key" TEXT,
    "area" TEXT,
    "rating_avg" DECIMAL(2,1),
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "reply_hours" INTEGER,
    "blocked_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by" UUID,
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "area" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "category_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spec_schema" JSONB NOT NULL DEFAULT '[]',
    "rules_note" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "in_the_box" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "condition" "item_condition" NOT NULL,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "price_1d_paise" INTEGER NOT NULL,
    "price_3d_paise" INTEGER NOT NULL,
    "price_7d_paise" INTEGER NOT NULL,
    "deposit_paise" INTEGER NOT NULL,
    "delivery_fee_paise" INTEGER,
    "delivery_radius_km" INTEGER,
    "min_days" INTEGER NOT NULL DEFAULT 1,
    "max_days" INTEGER NOT NULL DEFAULT 30,
    "area" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "pickup_instructions" TEXT,
    "status" "item_status" NOT NULL DEFAULT 'live',
    "rejection_reason" TEXT,
    "rating_avg" DECIMAL(2,1),
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "s3_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "item_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "item_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "item_id" UUID NOT NULL,
    "renter_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "handover" "handover" NOT NULL,
    "delivery_address" JSONB,
    "rate_paise" INTEGER NOT NULL,
    "rent_paise" INTEGER NOT NULL,
    "service_fee_paise" INTEGER NOT NULL,
    "delivery_fee_paise" INTEGER NOT NULL DEFAULT 0,
    "deposit_paise" INTEGER NOT NULL,
    "commission_paise" INTEGER NOT NULL,
    "total_paise" INTEGER NOT NULL,
    "late_fee_paise" INTEGER NOT NULL DEFAULT 0,
    "status" "booking_status" NOT NULL DEFAULT 'requested',
    "expires_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "picked_up_at" TIMESTAMPTZ(6),
    "returned_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_events" (
    "id" BIGSERIAL NOT NULL,
    "booking_id" UUID NOT NULL,
    "actor_id" UUID,
    "from_status" "booking_status",
    "to_status" "booking_status" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "kind" "payment_kind" NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'created',
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "razorpay_refund_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "stage" "photo_stage" NOT NULL,
    "s3_key" TEXT NOT NULL,
    "taken_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "item_id" UUID,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "opened_by" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "claim_paise" INTEGER NOT NULL,
    "status" "dispute_status" NOT NULL DEFAULT 'open',
    "resolved_by" UUID,
    "owner_keeps_paise" INTEGER,
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "photo_key" TEXT,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "addresses_user_id_idx" ON "addresses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_groups_slug_key" ON "category_groups"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_group_id_idx" ON "categories"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "items_slug_key" ON "items"("slug");

-- CreateIndex
CREATE INDEX "items_category_id_status_idx" ON "items"("category_id", "status");

-- CreateIndex
CREATE INDEX "items_owner_id_idx" ON "items"("owner_id");

-- CreateIndex
CREATE INDEX "items_area_idx" ON "items"("area");

-- CreateIndex
CREATE INDEX "item_photos_item_id_position_idx" ON "item_photos"("item_id", "position");

-- CreateIndex
CREATE INDEX "item_blocks_item_id_from_date_idx" ON "item_blocks"("item_id", "from_date");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_code_key" ON "bookings"("code");

-- CreateIndex
CREATE INDEX "bookings_renter_id_status_start_date_idx" ON "bookings"("renter_id", "status", "start_date" DESC);

-- CreateIndex
CREATE INDEX "bookings_owner_id_status_created_at_idx" ON "bookings"("owner_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "bookings_item_id_status_idx" ON "bookings"("item_id", "status");

-- CreateIndex
CREATE INDEX "bookings_status_expires_at_idx" ON "bookings"("status", "expires_at");

-- CreateIndex
CREATE INDEX "booking_events_booking_id_created_at_idx" ON "booking_events"("booking_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_razorpay_order_id_key" ON "payments"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_razorpay_payment_id_key" ON "payments"("razorpay_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_razorpay_refund_id_key" ON "payments"("razorpay_refund_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "handover_photos_booking_id_stage_idx" ON "handover_photos"("booking_id", "stage");

-- CreateIndex
CREATE INDEX "reviews_item_id_created_at_idx" ON "reviews"("item_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reviews_subject_id_created_at_idx" ON "reviews"("subject_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_booking_id_author_id_key" ON "reviews"("booking_id", "author_id");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_booking_id_key" ON "disputes"("booking_id");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "messages_booking_id_created_at_idx" ON "messages"("booking_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "category_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_photos" ADD CONSTRAINT "item_photos_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_blocks" ADD CONSTRAINT "item_blocks_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_renter_id_fkey" FOREIGN KEY ("renter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_photos" ADD CONSTRAINT "handover_photos_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_photos" ADD CONSTRAINT "handover_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Hand-written: business rules Prisma cannot express (docs/01-data-model.md)
-- ─────────────────────────────────────────────────────────────────────────

-- No double booking (PRD FR-15). Active bookings of one item may not overlap.
-- '[)' leaves the return day free for the next renter. Violations raise 23P01 → API 409 dates_taken.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("item_id" WITH =, daterange("start_date", "end_date", '[)') WITH &&)
  WHERE ("status" IN ('approved', 'paid', 'picked_up'));

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_dates" CHECK ("end_date" > "start_date" AND "days" = "end_date" - "start_date");
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_not_own_item" CHECK ("renter_id" <> "owner_id");
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_money" CHECK (
  "rate_paise" > 0 AND "rent_paise" = "rate_paise" * "days" AND "service_fee_paise" >= 0
  AND "delivery_fee_paise" >= 0 AND "deposit_paise" >= 0 AND "commission_paise" >= 0 AND "late_fee_paise" >= 0
  AND "total_paise" = "rent_paise" + "service_fee_paise" + "delivery_fee_paise" + "deposit_paise"
);

ALTER TABLE "items" ADD CONSTRAINT "items_prices" CHECK (
  "price_1d_paise" > 0 AND "price_3d_paise" > 0 AND "price_7d_paise" > 0
  AND "price_3d_paise" <= "price_1d_paise" AND "price_7d_paise" <= "price_3d_paise"
  AND "deposit_paise" >= 0
);
ALTER TABLE "items" ADD CONSTRAINT "items_days" CHECK ("min_days" >= 1 AND "max_days" >= "min_days" AND "max_days" <= 30);
ALTER TABLE "items" ADD CONSTRAINT "items_delivery" CHECK (
  ("delivery_fee_paise" IS NULL AND "delivery_radius_km" IS NULL)
  OR ("delivery_fee_paise" >= 0 AND "delivery_radius_km" BETWEEN 1 AND 50)
);
ALTER TABLE "items" ADD CONSTRAINT "items_location" CHECK ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180);
ALTER TABLE "item_blocks" ADD CONSTRAINT "item_blocks_dates" CHECK ("to_date" >= "from_date");
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount" CHECK ("amount_paise" > 0);
