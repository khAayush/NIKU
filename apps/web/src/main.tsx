import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ME_KEY } from './api/auth';
import { ApiRequestError } from './api/client';
import { registerServiceWorker } from './lib/pwa';
import '@fontsource-variable/geist';
import './index.css';

const queryClient: QueryClient = new QueryClient({
  // A 401 from any request means the session ended (expired, reset elsewhere): show login.
  queryCache: new QueryCache({
    onError: (err) => {
      if (err instanceof ApiRequestError && err.status === 401)
        queryClient.setQueryData(ME_KEY, null);
    },
  }),
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2,
    },
  },
});

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
