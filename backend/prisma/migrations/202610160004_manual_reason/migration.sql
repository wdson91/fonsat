ALTER TABLE entry_versions ADD CONSTRAINT manual_reason_required CHECK (source <> 'manual' OR (reason IS NOT NULL AND length(trim(reason)) > 0));
