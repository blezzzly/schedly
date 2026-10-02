-- A short share code that lets one account copy another account's schedule.
--
-- The payload is the schedule itself (compressed by lib/schedule-share), not
-- just a schedule id: a code must keep resolving even after its owner edits or
-- deletes the schedule it came from.
CREATE TABLE "schedule_shares" (
    "code"        TEXT        NOT NULL,
    "schedule_id" TEXT        NOT NULL,
    "user_id"     TEXT        NOT NULL,
    "payload"     TEXT        NOT NULL,
    "expires_at"  TIMESTAMP(3) NOT NULL,
    "used_at"     TIMESTAMP(3),
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_shares_pkey" PRIMARY KEY ("code")
);

-- Sweeping expired codes is the only way this table ever loses rows, so the
-- cleanup job filters on exactly this column.
CREATE INDEX "schedule_shares_expires_at_idx" ON "schedule_shares" ("expires_at");

-- Listing the codes you created, and cascade-deleting them with the account.
CREATE INDEX "schedule_shares_user_id_idx" ON "schedule_shares" ("user_id");

ALTER TABLE "schedule_shares"
    ADD CONSTRAINT "schedule_shares_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
