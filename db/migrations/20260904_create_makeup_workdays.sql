-- "Ngày làm bù" — a Saturday/Sunday explicitly declared a normal WORKING day, to make up for an
-- extended holiday block before/after it (opposite of `holidays`: overrides the weekend default
-- rather than adding a non-working day). Consumed by working-days.ts's HolidaySet.workdays via
-- master-data-service.ts's getActiveHolidaySet — a date here always wins over both the weekend
-- check and `holidays`.
CREATE TABLE IF NOT EXISTS makeup_workdays (
    id SERIAL PRIMARY KEY,
    work_date DATE NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_makeup_workdays_active ON makeup_workdays (work_date) WHERE is_active;
