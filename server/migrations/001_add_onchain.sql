-- server/migrations/001_add_onchain.sql
ALTER TABLE artwork ADD COLUMN token_id INTEGER;
ALTER TABLE artwork ADD COLUMN tx_hash TEXT;
