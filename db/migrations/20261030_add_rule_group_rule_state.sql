-- Rule Groups become layered (owner decision 2026-10-26, spec 2026-10-25-rule-groups-design.md §6.2 revised):
-- an Epic is judged by EVERY enabled group it matches, highest priority first, Default last. For each rule (slot)
-- the nearest matching group that names it decides: 'ON' (applies) or 'OFF' (does not apply, even if a lower group
-- or Default turns it on). A rule a group does not name is inherited from the next group.
--
-- Until now a group's rows only said "this rule is selected" and an Epic used its one group's rows alone. To keep
-- every Epic judged exactly as before, each non-default group gets an explicit 'OFF' row for every rule the Default
-- group runs and the group did not select (that is what "not selected" meant). Run once: only when the column is new.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'scoring_rule_group_rules' AND column_name = 'state'
    ) THEN
        ALTER TABLE scoring_rule_group_rules ADD COLUMN state TEXT NOT NULL DEFAULT 'ON';
        ALTER TABLE scoring_rule_group_rules ADD CONSTRAINT scoring_rule_group_rules_state_check CHECK (state IN ('ON', 'OFF'));

        INSERT INTO scoring_rule_group_rules (group_id, rule_id, state)
        SELECT g.id, d.rule_id, 'OFF'
        FROM scoring_rule_groups g
        CROSS JOIN (
            SELECT dr.rule_id
            FROM scoring_rule_group_rules dr
            JOIN scoring_rule_groups dg ON dg.id = dr.group_id AND dg.is_default
        ) d
        WHERE NOT g.is_default
          AND NOT EXISTS (SELECT 1 FROM scoring_rule_group_rules x WHERE x.group_id = g.id AND x.rule_id = d.rule_id)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
