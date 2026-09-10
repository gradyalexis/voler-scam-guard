import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Voler Scam Guard',
  description: 'Dashboard admin untuk bot anti-scam Discord',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
