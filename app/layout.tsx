import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'لوحة إدارة ري الحدائق',
  description: 'لوحة أدمن لمتابعة مشاريع وحدائق الري',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>

  {/* تحديث إجباري عند وجود إصدار جديد */}
  <script
    dangerouslySetInnerHTML={{
      __html: `
        (function () {
          const KEY = "admin_dashboard_build_version";

          async function checkVersion() {
            try {
              const res = await fetch('/api/version', { cache: 'no-store' });
              const data = await res.json();
              const current = localStorage.getItem(KEY);

              if (current && current !== data.version) {
                localStorage.setItem(KEY, data.version);
                window.location.reload();
                return;
              }

              if (!current) {
                localStorage.setItem(KEY, data.version);
              }
            } catch (e) {}
          }

          checkVersion();
        })();
      `,
    }}
  />

  {children}

</body>
    </html>
  );
}
