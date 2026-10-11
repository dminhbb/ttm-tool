-- Migration: Add epic_previous_status and 9 epic_khau_* cause/note columns to canonical issues table
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS previous_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS khau_ba TEXT,
  ADD COLUMN IF NOT EXISTS khau_co TEXT,
  ADD COLUMN IF NOT EXISTS khau_dev TEXT,
  ADD COLUMN IF NOT EXISTS khau_pm_sm TEXT,
  ADD COLUMN IF NOT EXISTS khau_po TEXT,
  ADD COLUMN IF NOT EXISTS khau_pentest TEXT,
  ADD COLUMN IF NOT EXISTS khau_sa TEXT,
  ADD COLUMN IF NOT EXISTS khau_sit_uat TEXT,
  ADD COLUMN IF NOT EXISTS note_ly_do_khac TEXT;
