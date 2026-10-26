-- "TTM-applied" rules (owner 2026-10-26, CSV fields TTM-applied / except-TTM-plan — migration 20261102):
--  1. Rule Group condition "TTM-applied": EXCEPTION ('Ngoại lệ') / STANDARD (blank, None, 'Theo quy định', anything else);
--     NULL = any. Lets a group turn the rule ttm-cntt-except-plan ON for the Epics with a Kế hoạch ngoại lệ TTM.
--  2. black_listed_epics.source: MANUAL (Duyệt Epic / "Epic ngoại lệ" popup) or IMPORT (the importer added the Epic because its
--     TTM-applied is 'Không áp dụng'). Only IMPORT rows are removed by the importer when the value changes.
--  3. The new data-quality rule dq-r11 (Kế hoạch ngoại lệ TTM thiếu / sai) joins the Default group — every Epic is judged by it.
ALTER TABLE scoring_rule_groups ADD COLUMN IF NOT EXISTS ttm_applied TEXT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scoring_rule_groups_ttm_applied_check') THEN
        ALTER TABLE scoring_rule_groups ADD CONSTRAINT scoring_rule_groups_ttm_applied_check
            CHECK (ttm_applied IS NULL OR ttm_applied IN ('EXCEPTION', 'STANDARD'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'black_listed_epics_source_check') THEN
        ALTER TABLE black_listed_epics ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'MANUAL';
        ALTER TABLE black_listed_epics ADD CONSTRAINT black_listed_epics_source_check CHECK (source IN ('MANUAL', 'IMPORT'));
    END IF;
END $$;

INSERT INTO scoring_rule_group_rules (group_id, rule_id, state)
SELECT g.id, 'dq-r11', 'ON' FROM scoring_rule_groups g WHERE g.is_default
ON CONFLICT DO NOTHING;
