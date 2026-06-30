import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Providers } from '@/components/providers';
import { RouteFallback } from '@/components/route-fallback';
import { router } from '@/router';
import '@/app/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <Suspense fallback={<RouteFallback />}>
        <RouterProvider router={router} />
      </Suspense>
    </Providers>
  </StrictMode>,
);
