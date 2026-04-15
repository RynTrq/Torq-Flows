import React from 'react';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import '../styles/tailwind.css';
import { APP_DESCRIPTION, APP_NAME } from '@/lib/brand';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: `${APP_NAME} | Visual Workflow Builder`,
  description: APP_DESCRIPTION,
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/x-icon' }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <Toaster theme="dark" position="top-right" richColors />
      </body>
    </html>
  );
}
