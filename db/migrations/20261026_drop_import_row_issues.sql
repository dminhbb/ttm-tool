-- Retire import_row_issues (owner decision 2026-10-24, DB-size / faster import). MUST run after the code that
-- no longer reads or writes it is deployed.
--
-- It held the WARNING / INVALID rows of each import batch for one place only: the "Chi tiết lỗi/cảnh báo"
-- window of a batch in Nguồn dữ liệu, which nobody used. That window, its warning statistics and the
-- per-batch detail computation done at import time are gone; the upload response still lists the rows that
-- failed validation, and import_batches keeps the success / warning / error counts of every batch.
DROP TABLE IF EXISTS import_row_issues;
