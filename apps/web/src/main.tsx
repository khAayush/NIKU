import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { persistOptions, queryClient, resumeSavedChanges } from './lib/queryClient';
import { registerServiceWorker } from './lib/pwa';
import '@fontsource-variable/geist';
import './index.css';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Restores the copy saved on this device, then sends changes made while offline. */}
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      // Not awaited: offline, these wait for the connection, and the app shouldn't.
      onSuccess={() => void resumeSavedChanges()}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
