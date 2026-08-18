import type { Metadata } from 'next';
import { Geist_Mono, Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';

// Wise Sans is proprietary; Inter at weight 900 is the brief's own recommended substitute for
// the brand's heavy display voice, and doubles as the body/UI face (DESIGN.md Typography note).
const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800', '900'],
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
      <body className={`${inter.variable} ${geistMono.variable} min-h-[100dvh] font-sans antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
