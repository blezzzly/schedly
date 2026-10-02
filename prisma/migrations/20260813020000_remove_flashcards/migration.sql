-- DropForeignKey
ALTER TABLE "flashcards" DROP CONSTRAINT IF EXISTS "flashcards_deck_id_fkey";

-- DropForeignKey
ALTER TABLE "flashcard_decks" DROP CONSTRAINT IF EXISTS "flashcard_decks_user_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "flashcards";

-- DropTable
DROP TABLE IF EXISTS "flashcard_decks";
