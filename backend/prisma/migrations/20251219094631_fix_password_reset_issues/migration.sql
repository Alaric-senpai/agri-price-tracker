-- AlterTable
ALTER TABLE "admin_requests" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "chat_conversations" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "crops" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "kamis_sync_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "markets" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "price_entries" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "price_predictions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "regions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sms_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sms_subscriptions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sms_templates" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "system_settings" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_password_reset_tokens_token" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_password_reset_tokens_user_id" ON "password_reset_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
