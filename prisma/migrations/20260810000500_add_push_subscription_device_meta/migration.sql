-- AddPushSubscriptionDeviceMeta
ALTER TABLE "push_subscriptions" ADD COLUMN "user_agent" TEXT,
ADD COLUMN "device" TEXT,
ADD COLUMN "platform" TEXT;