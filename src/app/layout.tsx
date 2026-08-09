import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';

const geistSans = Geist({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-geist-sans',
});

const geistMono = Geist_Mono({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: 'TTM Monitor - Quản trị nguồn dữ liệu',
  description: 'Hệ thống giám sát Time to Market của các yêu cầu Epic',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-[100dvh] font-sans antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
