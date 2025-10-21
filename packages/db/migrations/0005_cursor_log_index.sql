ALTER TABLE ingestion_cursors
  ADD COLUMN cursor_log_index INTEGER NOT NULL DEFAULT 0;
