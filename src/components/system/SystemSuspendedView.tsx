'use client';

import '@/app/rich-text.css';
import type { MouseEvent } from 'react';
import { Plugs, Prohibit, Rss, SignIn } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { NEWS_LETTER_PATH } from '@/lib/system-suspension';

export interface SystemSuspendedViewProps {
  allowMcp: boolean;
  allowNewsLetter: boolean;
  /** Existing "MCP Server" switch (Quản trị hệ thống → MCP Server). */
  mcpEnabled: boolean;
  /** Already sanitized (server side) — never pass HTML that did not go through sanitizeRichHtml. */
  messageHtml: string;
  /** Preview inside Quản trị hệ thống: links do not navigate. */
  preview?: boolean;
}

const LINK_CLASS = 'inline-flex min-h-11 items-center gap-2 rounded-full border border-fb-border bg-fb-surface px-5 text-sm font-semibold text-fb-text-primary shadow-sm transition-colors hover:bg-fb-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fb-blue';

/**
 * "Tạm dừng hệ thống" — the full-screen page (no left panel, no footer): a large Prohibit icon, the SUPERADMIN's message
 * in large centered type, then the parts still open: "Bản tin", "MCP Server ON/OFF" (no screen of its own — a status
 * label) and the sign-in for administrators.
 */
export function SystemSuspendedView({ allowMcp, allowNewsLetter, mcpEnabled, messageHtml, preview = false }: SystemSuspendedViewProps) {
  const go = preview ? (event: MouseEvent) => event.preventDefault() : undefined;
  return (
    <main className={cn('flex flex-col items-center justify-center bg-fb-bg px-4 py-12 text-fb-text-primary', preview ? 'min-h-full' : 'min-h-[100dvh]')}>
      <div className="flex w-full max-w-3xl flex-col items-center gap-8 text-center">
        <Prohibit className="size-28 text-status-danger sm:size-36" weight="bold" aria-hidden="true" />
        <div
          className="rich-content w-full text-xl font-semibold leading-relaxed sm:text-2xl"
          // Sanitized by the server (lib/rich-html-sanitizer.ts) when stored and again when served.
          dangerouslySetInnerHTML={{ __html: messageHtml }}
        />
        <nav aria-label="Chức năng vẫn truy cập được" className="flex flex-wrap items-center justify-center gap-3">
          {allowNewsLetter && (
            <a className={LINK_CLASS} href={NEWS_LETTER_PATH} onClick={go}>
              <Rss className="size-5 text-fb-blue" weight="bold" aria-hidden="true" />
              Bản tin
            </a>
          )}
          {allowMcp && (
            <span
              className={cn(LINK_CLASS, 'cursor-default hover:bg-fb-surface')}
              title="MCP Server cho AI chatbot — kết nối qua địa chỉ /api/mcp của ứng dụng"
            >
              <Plugs className="size-5 text-fb-blue" weight="bold" aria-hidden="true" />
              MCP Server
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', mcpEnabled ? 'bg-status-success-soft text-status-success' : 'bg-fb-control text-fb-text-secondary')}>
                {mcpEnabled ? 'ON' : 'OFF'}
              </span>
            </span>
          )}
          <a className={LINK_CLASS} href="/login" onClick={go}>
            <SignIn className="size-5 text-fb-blue" weight="bold" aria-hidden="true" />
            Đăng nhập cho Quản trị viên
          </a>
        </nav>
      </div>
    </main>
  );
}
