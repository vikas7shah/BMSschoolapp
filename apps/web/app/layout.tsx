import type { Metadata, Viewport } from 'next';
import { Fraunces } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/lib/session';
import { RegisterServiceWorker } from '@/components/register-sw';

// One warm serif, used only where the app speaks in the school's voice.
const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-fraunces', display: 'swap' });

export const metadata: Metadata = {
  title: 'BMS Families',
  description: 'Snack days, school news and the calendar for Burlington Montessori School families',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'BMS Families' },
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#faf7f2',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fraunces.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <SessionProvider>
          {children}
          <RegisterServiceWorker />
        </SessionProvider>
      </body>
    </html>
  );
}
