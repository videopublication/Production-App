-- Per-transaction answers the data team needs that can't be derived from the transaction
-- itself. Today that is only "was the Zoom recorder actually used on this shoot?", asked
-- when cards are returned; kept as jsonb so further report questions don't need another
-- migration.
--
-- Everything else on the data team's old Google Form (event name, location, date, cameras
-- used, cards taken, camera person) is already derivable from shoots, assignments and the
-- transaction's equipment items.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS data_report JSONB;

-- Notify PostgREST to reload the schema cache so the API picks it up immediately
NOTIFY pgrst, 'reload schema';
