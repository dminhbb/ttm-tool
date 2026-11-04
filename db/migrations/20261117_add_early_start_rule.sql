-- Rule "Start sớm" (early-start, owner 2026-11-04): Epic_Real_Start_Date (crawl tool V16.1) earlier than the Epic's
-- Start Date → recommendation REC_EARLY_START, and TTM-CNTT (QLDA) judged again from that date for the report
-- "Báo cáo Epic start sớm". Turned ON in the Default group, so every Rule Group inherits it unless it turns it OFF.
INSERT INTO scoring_rule_group_rules (group_id, rule_id, state)
SELECT g.id, 'early-start', 'ON' FROM scoring_rule_groups g WHERE g.is_default
ON CONFLICT DO NOTHING;
