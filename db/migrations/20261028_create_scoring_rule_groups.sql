-- Rule Groups of the Epic Scoring Service (spec docs/superpowers/specs/2026-10-25-rule-groups-design.md §9.1).
-- A Rule Group = a range of Epics by their dates (5 From/To pairs, both ends inclusive, empty = open; AND) + the
-- Rule objects (code: src/lib/scoring/registry.ts) that judge them. An Epic belongs to the highest-priority enabled
-- group it matches, otherwise to the default group — which always exists, can't be renamed, disabled or deleted, has
-- no date conditions and always comes last. Managed on "Rule Management" (SUPERADMIN).
CREATE TABLE IF NOT EXISTS scoring_rule_groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    priority INTEGER NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_from DATE,
    created_to DATE,
    idea_approved_from DATE,
    idea_approved_to DATE,
    start_from DATE,
    start_to DATE,
    r4g_from DATE,
    r4g_to DATE,
    due_from DATE,
    due_to DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT scoring_rule_groups_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT scoring_rule_groups_created_range CHECK (created_from IS NULL OR created_to IS NULL OR created_from <= created_to),
    CONSTRAINT scoring_rule_groups_idea_range CHECK (idea_approved_from IS NULL OR idea_approved_to IS NULL OR idea_approved_from <= idea_approved_to),
    CONSTRAINT scoring_rule_groups_start_range CHECK (start_from IS NULL OR start_to IS NULL OR start_from <= start_to),
    CONSTRAINT scoring_rule_groups_r4g_range CHECK (r4g_from IS NULL OR r4g_to IS NULL OR r4g_from <= r4g_to),
    CONSTRAINT scoring_rule_groups_due_range CHECK (due_from IS NULL OR due_to IS NULL OR due_from <= due_to),
    CONSTRAINT scoring_rule_groups_default_shape CHECK (NOT is_default OR (
        enabled AND created_from IS NULL AND created_to IS NULL AND idea_approved_from IS NULL AND idea_approved_to IS NULL
        AND start_from IS NULL AND start_to IS NULL AND r4g_from IS NULL AND r4g_to IS NULL AND due_from IS NULL AND due_to IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS scoring_rule_groups_name_uq ON scoring_rule_groups (lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS scoring_rule_groups_single_default ON scoring_rule_groups (is_default) WHERE is_default;

-- The rules a group selected, by Rule object id (code registry — no FK; an id the code no longer has is ignored).
CREATE TABLE IF NOT EXISTS scoring_rule_group_rules (
    group_id INTEGER NOT NULL REFERENCES scoring_rule_groups(id) ON DELETE CASCADE,
    rule_id TEXT NOT NULL,
    PRIMARY KEY (group_id, rule_id)
);

-- One row per save of the whole configuration (D8): who, when, before/after. Its newest id is also the
-- configuration version a save must start from (two SUPERADMINs can't overwrite each other).
CREATE TABLE IF NOT EXISTS scoring_rule_group_history (
    id SERIAL PRIMARY KEY,
    saved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    saved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    config_before JSONB NOT NULL,
    config_after JSONB NOT NULL,
    rule_code_version TEXT NOT NULL
);

-- Seed: the default group selecting every Rule object a group can select — exactly how every Epic was judged
-- before Rule Groups (DEFAULT_RULE_GROUP in registry.ts).
INSERT INTO scoring_rule_groups (name, priority, is_default, enabled)
SELECT 'Default', 0, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM scoring_rule_groups WHERE is_default);

INSERT INTO scoring_rule_group_rules (group_id, rule_id)
SELECT g.id, r.rule_id
FROM scoring_rule_groups g
CROSS JOIN (VALUES
    ('dq-r8'), ('dq-r10'), ('dq-r2'), ('dq-r1'), ('dq-r3'), ('dq-r4'), ('dq-r5'), ('dq-r6'), ('dq-r9'),
    ('ttm-cntt-sep-2026'), ('fail-reason-stage'), ('fail-reason-dept'),
    ('ttm-e2e-july-2026'),
    ('release-waiting-golive'), ('release-justify-golive')
) AS r(rule_id)
WHERE g.is_default
ON CONFLICT DO NOTHING;
