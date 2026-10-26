import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePyJiraApi } from '@/lib/adapters/py-jira-api-adapter';

describe('PyJiraApiAdapter — new CSV fields (previous_status & khau_* causes)', () => {
  it('correctly parses epic_previous_status and 9 epic_khau_* fields when present', () => {
    const csvHeader = 'hierarchy_level,project_key,epic_key,epic_name,epic_status,epic_previous_status,epic_request_type,epic_request_level,epic_requesting_unit,epic_assignee,epic_idea_approval_date,epic_start_date,epic_due_date,epic_r4g_date,epic_created,epic_updated,epic_Components,epic_khau_ba,epic_khau_co,epic_khau_dev,epic_khau_pm_sm,epic_khau_po,epic_khau_pentest,epic_khau_sa,epic_khau_sit_uat,epic_note_ly_do_khac,epic_stories';
    const csvRow = 'EPIC,BPMCN,BPMCN-46069,Cải tiến mục đích,Pending,In Progress,Cải tiến,,Khối Công nghệ thông tin,Nguyễn Đức Anh,,2026-06-01,,,2026-05-29,2026-08-24,,Chậm chốt YC,Khâu CO trễ,Lỗi DEV,PM nghỉ,PO chậm,Pentest trễ,SA chưa chốt,SIT UAT thiếu testcase,Lý do khác nghi ngờ,BPMCN-45936';

    const result = parsePyJiraApi(`${csvHeader}\n${csvRow}`);
    assert.equal(result.issues.length, 1);

    const epic = result.issues[0];
    assert.equal(epic.issueKey, 'BPMCN-46069');
    assert.equal(epic.status, 'Pending');
    assert.equal(epic.previousStatus, 'In Progress');
    assert.equal(epic.khauBa, 'Chậm chốt YC');
    assert.equal(epic.khauCo, 'Khâu CO trễ');
    assert.equal(epic.khauDev, 'Lỗi DEV');
    assert.equal(epic.khauPmSm, 'PM nghỉ');
    assert.equal(epic.khauPo, 'PO chậm');
    assert.equal(epic.khauPentest, 'Pentest trễ');
    assert.equal(epic.khauSa, 'SA chưa chốt');
    assert.equal(epic.khauSitUat, 'SIT UAT thiếu testcase');
    assert.equal(epic.noteLyDoKhac, 'Lý do khác nghi ngờ');
  });

  it('leaves optional fields undefined when empty in CSV row', () => {
    const csvHeader = 'hierarchy_level,project_key,epic_key,epic_name,epic_status,epic_previous_status,epic_request_type,epic_request_level,epic_requesting_unit,epic_assignee,epic_idea_approval_date,epic_start_date,epic_due_date,epic_r4g_date,epic_created,epic_updated,epic_Components,epic_khau_ba,epic_khau_co,epic_khau_dev,epic_khau_pm_sm,epic_khau_po,epic_khau_pentest,epic_khau_sa,epic_khau_sit_uat,epic_note_ly_do_khac,epic_stories';
    const csvRow = 'EPIC,BPMCN,BPMCN-40088,Xây dựng SXKD,Cancelled,,Phát triển mới,,Khối KHCN,,,,,,2026-02-03,2026-03-03,,,,,,,,,,,,,,,,,,,,,,,,,';

    const result = parsePyJiraApi(`${csvHeader}\n${csvRow}`);
    assert.equal(result.issues.length, 1);

    const epic = result.issues[0];
    assert.equal(epic.issueKey, 'BPMCN-40088');
    assert.equal(epic.previousStatus, undefined);
    assert.equal(epic.khauBa, undefined);
    assert.equal(epic.khauDev, undefined);
    assert.equal(epic.noteLyDoKhac, undefined);
  });
});

describe('PyJiraApiAdapter — main_fail_dept ("Phòng chịu trách nhiệm chính", 2026-10-14)', () => {
  const header = 'hierarchy_level,project_key,epic_key,epic_name,epic_status,epic_r4g_date,main_fail_dept';

  it('reads main_fail_dept on an epic row (column without the epic_ prefix)', () => {
    const epic = parsePyJiraApi(`${header}\nepic,WM,WM-1,Epic A,Released,2026-08-24,Phòng PTUD`).issues[0];
    assert.equal(epic.mainFailDept, 'Phòng PTUD');
  });

  it('keeps "None" as sent (the rule treats it as empty) and leaves a blank cell undefined', () => {
    const [withNone, blank] = parsePyJiraApi(`${header}\nepic,WM,WM-2,Epic B,Released,2026-08-24,None\nepic,WM,WM-3,Epic C,Released,2026-08-24,`).issues;
    assert.equal(withNone.mainFailDept, 'None');
    assert.equal(blank.mainFailDept, undefined);
  });
});

describe('PyJiraApiAdapter — TTM-applied / except-TTM-plan (2026-10-26)', () => {
  it('reads the crawl headers as spelled, case-insensitive, on an epic row', () => {
    const header = 'hierarchy_level,project_key,epic_key,epic_name,epic_status,TTM-applied,except-TTM-plan';
    const epic = parsePyJiraApi(`${header}\nepic,WM,WM-1,Epic A,Released,Yes,Kế hoạch ngoại lệ Q4`).issues[0];
    assert.equal(epic.ttmApplied, 'Yes');
    assert.equal(epic.exceptTtmPlan, 'Kế hoạch ngoại lệ Q4');
  });

  it('accepts the snake_case and epic_-prefixed spellings; a blank cell is undefined', () => {
    const header = 'hierarchy_level,project_key,epic_key,epic_name,epic_status,epic_ttm_applied,except_ttm_plan';
    const [filled, blank] = parsePyJiraApi(`${header}\nepic,WM,WM-2,Epic B,Released,No,Plan B\nepic,WM,WM-3,Epic C,Released,,`).issues;
    assert.equal(filled.ttmApplied, 'No');
    assert.equal(filled.exceptTtmPlan, 'Plan B');
    assert.equal(blank.ttmApplied, undefined);
    assert.equal(blank.exceptTtmPlan, undefined);
  });

  it('a file without the columns still imports (both fields undefined)', () => {
    const epic = parsePyJiraApi('hierarchy_level,project_key,epic_key,epic_name,epic_status\nepic,WM,WM-4,Epic D,Released').issues[0];
    assert.equal(epic.ttmApplied, undefined);
    assert.equal(epic.exceptTtmPlan, undefined);
  });
});

