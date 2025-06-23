
import type {Metadata} from 'next';
import { Toaster } from "@/components/ui/toaster"
import './globals.css';
import { Belleza, Alegreya } from 'next/font/google';

const belleza = Belleza({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-family-headline',
});

const alegreya = Alegreya({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  style: ['normal', 'italic'],
  variable: '--font-family-body',
});

export const metadata: Metadata = {
  title: 'Review Forge',
  description: 'Craft compelling Amazon reviews effortlessly with AI.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${belleza.variable} ${alegreya.variable}`} suppressHydrationWarning>
      <head>
        {/* Google Fonts are now handled by next/font, no direct link needed here unless for other fonts */}
      </head>
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
