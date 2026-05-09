import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { PanelToastProvider } from '../components/PanelToastProvider';
import ProtectedRoute from '../components/ProtectedRoute';
import { apiRequest, getStoredToken } from '../lib/api';
import { TelegramGroup } from '../lib/types';
import '../styles/globals.css';

const faviconSvg =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230891b2'/%3E%3Ctext x='32' y='43' font-size='34' text-anchor='middle'%3E%E2%9A%A1%3C/text%3E%3C/svg%3E";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isPublicPage = router.pathname === '/login';
  const [groupTitle, setGroupTitle] = useState('');

  useEffect(() => {
    if (isPublicPage || !getStoredToken()) {
      return;
    }

    let cancelled = false;
    void apiRequest<TelegramGroup>({ url: '/group', method: 'GET' })
      .then((response) => {
        if (!cancelled) setGroupTitle(response.data?.title || '');
      })
      .catch(() => {
        if (!cancelled) setGroupTitle('');
      });

    return () => {
      cancelled = true;
    };
  }, [isPublicPage, router.pathname]);

  const pageTitle = isPublicPage ? 'Login' : groupTitle || 'Painel do grupo';

  if (isPublicPage) {
    return (
      <PanelToastProvider>
        <Head>
          <title>{pageTitle}</title>
          <link rel="icon" href={faviconSvg} />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        </Head>
        <Component {...pageProps} />
      </PanelToastProvider>
    );
  }

  return (
    <PanelToastProvider>
      <Head>
        <title>{pageTitle}</title>
        <link rel="icon" href={faviconSvg} />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <ProtectedRoute>
        <Component {...pageProps} />
      </ProtectedRoute>
    </PanelToastProvider>
  );
}
