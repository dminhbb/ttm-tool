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
