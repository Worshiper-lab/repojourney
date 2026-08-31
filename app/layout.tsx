import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'RepoJourney — See how a feature actually works',
  description:
    'Turn any repository into an interactive, evidence-linked map of real user journeys across screens, APIs, logic, and data.',
  openGraph: {
    title: 'RepoJourney — See how a feature actually works',
    description:
      'Explore evidence-linked user journeys across screens, APIs, logic, and data.',
    type: 'website',
    images: [
      'https://raw.githubusercontent.com/Worshiper-lab/repojourney/main/public/og.png',
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RepoJourney — See how a feature actually works',
    description:
      'Explore evidence-linked user journeys across screens, APIs, logic, and data.',
    images: [
      'https://raw.githubusercontent.com/Worshiper-lab/repojourney/main/public/og.png',
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
