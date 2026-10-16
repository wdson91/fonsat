ALTER TABLE work_entries ADD COLUMN activity TEXT NOT NULL DEFAULT 'work' CHECK (activity IN ('work', 'break'));
ALTER TABLE clock_events DROP CONSTRAINT clock_events_kind_check;
ALTER TABLE clock_events ADD CONSTRAINT clock_events_kind_check CHECK (kind IN ('in', 'out', 'break_in', 'break_out'));
