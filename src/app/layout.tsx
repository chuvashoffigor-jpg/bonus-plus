import type { ReactNode } from 'react';

export const metadata = {
  title: 'Bonus Plus',
  description: 'Бэкенд программы лояльности',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>{children}</body>
    </html>
  );
}
