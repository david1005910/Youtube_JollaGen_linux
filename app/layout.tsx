import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TubeGen AI - YouTube Automation',
  description: 'AI 기반 스토리보드 & 영상 자동 생성',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <script src="https://cdn.tailwindcss.com" async></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('load', function() {
                if (typeof tailwind !== 'undefined') {
                  tailwind.config = {
                    theme: {
                      extend: {
                        colors: {
                          brand: {
                            50: '#f0f9ff',
                            100: '#e0f2fe',
                            500: '#0ea5e9',
                            600: '#0284c7',
                            900: '#0c4a6e',
                          }
                        }
                      }
                    }
                  }
                }
              });
            `,
          }}
        />
        <style>{`
          ::-webkit-scrollbar { width: 8px; height: 8px; }
          ::-webkit-scrollbar-track { background: #1e293b; }
          ::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
          ::-webkit-scrollbar-thumb:hover { background: #64748b; }
        `}</style>
      </head>
      <body className="bg-slate-950 text-slate-200 antialiased min-h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
