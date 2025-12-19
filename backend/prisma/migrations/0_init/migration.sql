-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "admin_request_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "price_trend" AS ENUM ('up', 'down', 'stable');

-- CreateEnum
CREATE TYPE "sms_status" AS ENUM ('pending', 'sent', 'failed', 'delivered');

-- CreateEnum
CREATE TYPE "sms_type" AS ENUM ('alert', 'update', 'prediction', 'weather', 'general');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('farmer', 'admin', 'super_admin');

-- CreateTable
CREATE TABLE "admin_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "region" VARCHAR(100) NOT NULL,
    "organization" VARCHAR(255) NOT NULL,
    "reason" TEXT,
    "status" "admin_request_status" DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ (6),
    "created_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "user_id" UUID,
    "session_id" VARCHAR(255),
    "messages" JSONB NOT NULL,
    "context" JSONB,
    "created_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crops" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "name" VARCHAR(100) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "unit" VARCHAR(20) DEFAULT 'kg',
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kamis_sync_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "sync_date" DATE NOT NULL,
    "records_processed" INTEGER DEFAULT 0,
    "records_inserted" INTEGER DEFAULT 0,
    "records_updated" INTEGER DEFAULT 0,
    "status" VARCHAR(20) DEFAULT 'pending',
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ (6),
    CONSTRAINT "kamis_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "name" VARCHAR(100) NOT NULL,
    "region_id" UUID NOT NULL,
    "location" VARCHAR(255),
    "contact_info" JSONB,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_entries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "crop_id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "market_id" UUID,
    "price" DECIMAL(10, 2) NOT NULL,
    "unit" VARCHAR(20) DEFAULT 'kg',
    "source" VARCHAR(50) NOT NULL,
    "entered_by" UUID,
    "verified_by" UUID,
    "is_verified" BOOLEAN DEFAULT false,
    "notes" TEXT,
    "entry_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "created_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "price_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_predictions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "crop_id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "current_price" DECIMAL(10, 2) NOT NULL,
    "predicted_price" DECIMAL(10, 2) NOT NULL,
    "prediction_date" DATE NOT NULL,
    "confidence_score" DECIMAL(5, 4),
    "model_version" VARCHAR(50),
    "factors" JSONB,
    "created_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "price_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "recipient" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "sms_type" "sms_type" NOT NULL,
    "status" "sms_status" DEFAULT 'pending',
    "external_id" VARCHAR(255),
    "cost" DECIMAL(8, 4),
    "sent_by" UUID,
    "error_message" TEXT,
    "sent_at" TIMESTAMPTZ (6),
    "delivered_at" TIMESTAMPTZ (6),
    "created_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_subscriptions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "phone" VARCHAR(20) NOT NULL,
    "user_id" UUID,
    "crops" JSONB,
    "regions" JSONB,
    "alert_types" JSONB,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sms_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_templates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "name" VARCHAR(100) NOT NULL,
    "template" TEXT NOT NULL,
    "variables" JSONB,
    "sms_type" "sms_type" NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "role" "user_role" DEFAULT 'farmer',
    "region" VARCHAR(100),
    "organization" VARCHAR(255),
    "is_active" BOOLEAN DEFAULT true,
    "email_verified" BOOLEAN DEFAULT false,
    "last_login" TIMESTAMPTZ (6),
    "created_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ (6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crops_name_key" ON "crops" ("name");

-- CreateIndex
CREATE UNIQUE INDEX "markets_name_region_id_key" ON "markets" ("name", "region_id");

-- CreateIndex
CREATE INDEX "idx_price_entries_crop_region" ON "price_entries" ("crop_id", "region_id");

-- CreateIndex
CREATE INDEX "idx_price_entries_date" ON "price_entries" ("entry_date");

-- CreateIndex
CREATE INDEX "idx_price_entries_source" ON "price_entries" ("source");

-- CreateIndex
CREATE INDEX "idx_price_entries_verified" ON "price_entries" ("is_verified");

-- CreateIndex
CREATE INDEX "idx_price_predictions_crop_region" ON "price_predictions" ("crop_id", "region_id");

-- CreateIndex
CREATE INDEX "idx_price_predictions_date" ON "price_predictions" ("prediction_date");

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "regions" ("name");

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions" ("code");

-- CreateIndex
CREATE INDEX "idx_sms_logs_created_at" ON "sms_logs" ("created_at");

-- CreateIndex
CREATE INDEX "idx_sms_logs_recipient" ON "sms_logs" ("recipient");

-- CreateIndex
CREATE INDEX "idx_sms_logs_status" ON "sms_logs" ("status");

-- CreateIndex
CREATE UNIQUE INDEX "sms_subscriptions_phone_key" ON "sms_subscriptions" ("phone");

-- CreateIndex
CREATE INDEX "idx_sms_subscriptions_active" ON "sms_subscriptions" ("is_active");

-- CreateIndex
CREATE INDEX "idx_sms_subscriptions_phone" ON "sms_subscriptions" ("phone");

-- CreateIndex
CREATE UNIQUE INDEX "sms_templates_name_key" ON "sms_templates" ("name");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings" ("key");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users" ("email");

-- CreateIndex
CREATE INDEX "idx_users_region" ON "users" ("region");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users" ("role");

-- AddForeignKey
ALTER TABLE "admin_requests"
ADD CONSTRAINT "admin_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_conversations"
ADD CONSTRAINT "chat_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "markets"
ADD CONSTRAINT "markets_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "price_entries"
ADD CONSTRAINT "price_entries_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "price_entries"
ADD CONSTRAINT "price_entries_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "price_entries"
ADD CONSTRAINT "price_entries_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "price_entries"
ADD CONSTRAINT "price_entries_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "price_entries"
ADD CONSTRAINT "price_entries_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "price_predictions"
ADD CONSTRAINT "price_predictions_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "price_predictions"
ADD CONSTRAINT "price_predictions_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sms_logs"
ADD CONSTRAINT "sms_logs_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sms_subscriptions"
ADD CONSTRAINT "sms_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sms_templates"
ADD CONSTRAINT "sms_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "system_settings"
ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;