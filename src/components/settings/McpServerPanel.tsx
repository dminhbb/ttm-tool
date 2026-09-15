'use client';

import { useEffect, useState } from 'react';
import { Broadcast, Key, Plugs, Trophy, Users } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { cn } from '@/lib/utils';
import type { McpSettings, McpUsageSummary } from '@/lib/mcp-types';

type SummaryResponse = { settings: McpSettings; usage: McpUsageSummary };

function StatTile({ icon: Icon, label, value }: { icon: typeof Broadcast; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-fb-border bg-fb-surface-muted px-4 py-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-md bg-fb-blue-soft text-fb-blue">
        <Icon className="w-5 h-5" weight="bold" />
      </div>
      <div>
        <p className="text-xl font-bold text-fb-text-primary">{value}</p>
        <p className="text-xs text-fb-text-secondary">{label}</p>
      </div>
    </div>
  );
}

export function McpServerPanel() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchSummary = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/mcp-settings');
      if (res.ok) setData(await res.json());
      else setMessage({ text: 'Không thể tải cấu hình MCP Server.', type: 'error' });
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchSummary);
  }, []);

  const handleToggle = async () => {
    if (!data) return;
    const nextEnabled = !data.settings.isEnabled;
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/mcp-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: nextEnabled }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Không thể cập nhật cấu hình.', type: 'error' });
        return;
      }
      setData((prev) => (prev ? { ...prev, settings: result } : prev));
      setMessage({ text: nextEnabled ? 'Đã bật MCP Server.' : 'Đã tắt MCP Server.', type: 'success' });
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'} title={message.type === 'success' ? 'Thành công' : 'Lỗi'}>
          {message.text}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plugs className="w-5 h-5 text-fb-blue" weight="bold" />
            <span>MCP Server</span>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-fb-text-secondary">
            Cho phép người dùng kết nối AI chatbot (Claude, ChatGPT, Gemini, Copilot...) tới ttm-tool qua MCP, tra cứu dữ liệu
            trực tiếp bằng hội thoại thay vì vào giao diện. Mỗi kết nối dùng Personal Access Token do chính người dùng tạo
            (mục &quot;Thông tin người dùng&quot;), luôn tuân theo đúng phân quyền hiện có của họ. Tắt công tắc này để chặn
            toàn bộ truy cập MCP ngay lập tức, kể cả khi token vẫn còn hiệu lực.
          </p>

          {isLoading || !data ? (
            <p className="text-sm text-fb-text-secondary">Đang tải...</p>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-fb-border bg-fb-surface-muted px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-fb-text-primary">Trạng thái tính năng</p>
                <p className="text-xs text-fb-text-secondary">
                  {data.settings.isEnabled ? 'Đang bật — AI chatbot có thể kết nối bằng token hợp lệ.' : 'Đang tắt — mọi kết nối MCP đều bị từ chối.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={data.settings.isEnabled}
                onClick={handleToggle}
                disabled={isSaving}
                className={cn(
                  'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors outline-none disabled:opacity-60',
                  data.settings.isEnabled ? 'bg-fb-blue' : 'bg-fb-border',
                )}
              >
                <span
                  className={cn(
                    'inline-block size-5 transform rounded-full bg-white shadow transition-transform',
                    data.settings.isEnabled ? 'translate-x-6' : 'translate-x-1',
                  )}
                />
              </button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thống kê sử dụng</CardTitle>
        </CardHeader>
        <CardBody>
          {isLoading || !data ? (
            <p className="text-sm text-fb-text-secondary">Đang tải...</p>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-3 gap-3">
                <StatTile icon={Key} label="Token đã cấp" value={data.usage.issuedTokenCount} />
                <StatTile icon={Broadcast} label="Lượt truy cập tuần này" value={data.usage.weeklyAccessCount} />
                <StatTile icon={Users} label="Token đang active" value={data.usage.activeTokenCount} />
              </div>

              <div>
                <h3 className="ui-card-title mb-2 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-fb-blue" weight="bold" /> Top 5 user sử dụng nhiều nhất (90 ngày gần đây)
                </h3>
                {data.usage.topUsers.length === 0 ? (
                  <EmptyState title="Chưa có dữ liệu truy cập" description="Thống kê sẽ hiển thị sau khi có kết nối MCP đầu tiên." />
                ) : (
                  <TableContainer>
                    <Table>
                      <THead>
                        <TR>
                          <TH>Hạng</TH>
                          <TH>Người dùng</TH>
                          <TH className="text-center">Số lượt truy cập</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {data.usage.topUsers.map((item, index) => (
                          <TR key={item.userId}>
                            <TD className="font-semibold">{index + 1}</TD>
                            <TD>
                              <p className="font-medium text-fb-text-primary">{item.fullName}</p>
                              <p className="text-xs text-fb-text-secondary">{item.email}</p>
                            </TD>
                            <TD className="text-center font-semibold text-fb-blue">{item.accessCount}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableContainer>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
