'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Plugs, Plus, Trash, Warning } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';
import { TableSkeleton } from '@/components/ui/Skeleton';
import type { McpAccessToken, McpAccessTokenCreated } from '@/lib/mcp-types';

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function PersonalAccessTokensPanel() {
  const [tokens, setTokens] = useState<McpAccessToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<McpAccessTokenCreated | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const fetchTokens = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/mcp-tokens');
      if (res.ok) setTokens(await res.json());
    } catch {
      setMessage({ text: 'Lỗi khi tải danh sách token.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchTokens);
  }, []);

  const handleCreate = async () => {
    const tokenName = newTokenName.trim();
    if (!tokenName) return;
    setIsCreating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/mcp-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenName }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Không thể tạo token.', type: 'error' });
        return;
      }
      setJustCreated(result as McpAccessTokenCreated);
      setNewTokenName('');
      fetchTokens();
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (item: McpAccessToken) => {
    if (!confirm(`Thu hồi token "${item.tokenName}"? Mọi ứng dụng AI đang dùng token này sẽ mất quyền truy cập ngay lập tức.`)) return;
    try {
      const res = await fetch(`/api/mcp-tokens?id=${item.id}`, { method: 'DELETE' });
      if (res.ok) {
        setMessage({ text: 'Đã thu hồi token.', type: 'success' });
        fetchTokens();
      } else {
        const result = await res.json();
        setMessage({ text: result.error || 'Thu hồi token thất bại.', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    }
  };

  const handleCopy = async () => {
    if (!justCreated) return;
    try {
      await navigator.clipboard.writeText(justCreated.token);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback if clipboard API not available
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Plugs className="w-4 h-4 text-fb-blue" weight="bold" />
        <h3 className="ui-card-title">Personal Access Token (kết nối AI chatbot qua MCP)</h3>
      </div>
      <p className="text-xs text-fb-text-secondary">
        Dùng token này để kết nối Claude, ChatGPT, Gemini, Copilot... tới ttm-tool qua MCP Server và tra cứu dữ liệu trực tiếp
        bằng hội thoại — AI sẽ chỉ thấy đúng dữ liệu theo quyền hạn tài khoản của bạn. Cần SUPERADMIN bật tính năng MCP Server
        trong Quản trị hệ thống trước khi token hoạt động được.
      </p>

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'} title={message.type === 'success' ? 'Thành công' : 'Lỗi'}>
          {message.text}
        </Alert>
      )}

      {justCreated && (
        <Alert variant="warning" title="Lưu lại token ngay — sẽ không hiển thị lại">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-fb-surface-muted px-2 py-1.5 border border-fb-border font-mono text-xs">
                {justCreated.token}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded p-1.5 text-fb-text-secondary hover:bg-fb-control hover:text-fb-text-primary"
                title="Sao chép token"
              >
                {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="flex items-center gap-1 text-xs text-fb-text-secondary">
              <Warning className="w-3.5 h-3.5 shrink-0" /> Dán token này vào cấu hình MCP connector của ứng dụng AI bạn dùng.
            </p>
            <Button size="sm" variant="secondary" onClick={() => setJustCreated(null)}>Đã lưu, đóng thông báo</Button>
          </div>
        </Alert>
      )}

      <div className="flex items-end gap-2">
        <Input
          label="Tên token"
          placeholder="Ví dụ: Claude Desktop, ChatGPT laptop..."
          value={newTokenName}
          onChange={(e) => setNewTokenName(e.target.value)}
        />
        <Button size="sm" icon={<Plus className="w-4 h-4" weight="bold" />} onClick={handleCreate} disabled={isCreating || !newTokenName.trim()}>
          {isCreating ? 'Đang tạo...' : 'Tạo token'}
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={2} />
      ) : tokens.length === 0 ? (
        <EmptyState title="Chưa có Personal Access Token nào" description="Tạo token đầu tiên để kết nối AI chatbot tới ttm-tool." />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH>Tên token</TH>
                <TH>Mã token</TH>
                <TH className="text-center">Trạng thái</TH>
                <TH>Tạo lúc</TH>
                <TH>Dùng lần cuối</TH>
                <TH className="text-center">Hành động</TH>
              </TR>
            </THead>
            <TBody>
              {tokens.map((item) => (
                <TR key={item.id}>
                  <TD className="font-semibold text-fb-text-primary">{item.tokenName}</TD>
                  <TD>
                    <span className="rounded bg-fb-surface-muted px-2 py-1 border border-fb-border font-mono text-xs">
                      {item.tokenPrefix}••••••••
                    </span>
                  </TD>
                  <TD className="text-center">
                    <Badge variant={item.revokedAt ? 'neutral' : 'success'}>{item.revokedAt ? 'Đã thu hồi' : 'Active'}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">{formatDateTime(item.createdAt)}</TD>
                  <TD className="whitespace-nowrap text-xs">{formatDateTime(item.lastUsedAt)}</TD>
                  <TD>
                    <div className="flex justify-center">
                      {!item.revokedAt && (
                        <TableAction variant="danger" icon={<Trash className="w-4 h-4" />} onClick={() => handleRevoke(item)}>
                          Thu hồi
                        </TableAction>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
