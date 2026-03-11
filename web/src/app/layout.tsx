import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Navbar } from '@/components/Navbar';
import AuthProvider from '@/components/AuthProvider';
import { AccessGate } from '@/components/AccessGate';
import { CommandPalette } from '@/components/CommandPalette';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' });

export const metadata: Metadata = {
    title: 'Project Cairo — SB Manifest Dashboard',
    description: 'Web dashboard for the SB Manifest Bot. Browse games, view DLC statistics, download manifests, and manage game files.',
    keywords: ['Steam', 'manifest', 'DLC', 'game files', 'dashboard'],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
            <body className="min-h-screen bg-surface">
                <AuthProvider>
                    <AccessGate>
                        <Navbar />
                        <main className="pt-16">{children}</main>
                        <CommandPalette />
                    </AccessGate>
                </AuthProvider>
            </body>
        </html>
    );
}
