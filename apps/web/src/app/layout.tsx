import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AuthCallbackCatcher } from './_lib/supabase/auth-callback-catcher';

import './globals.css';

export const metadata: Metadata = {
  title: 'Registro de asistencia RFID',
  description:
    'Sistema de registro de asistencia mediante RFID de la Institución Universitaria Visión de las Américas.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        className="min-h-dvh bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
        data-design-concept="tablero-de-aula"
        data-design-mode="operate"
        data-design-seed="4e33298b"
      >
        <AuthCallbackCatcher />
        {children}
      </body>
    </html>
  );
}
