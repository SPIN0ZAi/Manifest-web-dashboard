import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import AuthProvider from '@/components/AuthProvider';
import { AccessGate } from '@/components/AccessGate';
import './globals.css';

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
        <html lang="en" className="dark">
            <body className="min-h-screen bg-surface">
                <AuthProvider>
                    <AccessGate>
                        <Navbar />
                        <main className="pt-16">{children}</main>
                    </AccessGate>
                </AuthProvider>

                {/* Ambient background gradient */}
                <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                    <div className="absolute -top-[40%] -left-[20%] w-[60%] h-[60%] bg-brand-600/5 rounded-full blur-[120px]" />
                    <div className="absolute -bottom-[30%] -right-[20%] w-[50%] h-[50%] bg-purple-600/5 rounded-full blur-[120px]" />
                </div>
            </body>
        </html>
    );
}
