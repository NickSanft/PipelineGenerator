import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'pipeline-gen — CI/CD pipeline generator',
  description: 'Analyze any GitHub repository and generate a production-ready CI/CD pipeline in seconds.',
  openGraph: {
    title: 'pipeline-gen',
    description: 'Generate GitHub Actions or GitLab CI pipelines from any GitHub repo URL.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-[var(--border)] px-6 py-3 flex items-center justify-between">
          <span className="font-semibold text-[var(--text)] tracking-tight">
            pipeline<span className="text-[var(--accent)]">-gen</span>
          </span>
          <a
            href="https://github.com/anthropics/pipeline-gen"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          >
            GitHub ↗
          </a>
        </header>
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
