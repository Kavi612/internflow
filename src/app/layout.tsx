import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'InternFlow | AI Internship Review Automation System',
  description:
    'End-to-end automated internship onboarding, task assignment, in-app AI voice orientation meetings, weekly reviews, and automatic grading.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
