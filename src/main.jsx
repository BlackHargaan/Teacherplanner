import React from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './lib/store.jsx';
import App from './App.jsx';
import '@fontsource-variable/lexend';
import { CloudProvider } from './lib/cloud/CloudProvider.jsx';
import { TourProvider } from './components/Tour.jsx';
import { Splash } from './components/Splash.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StoreProvider>
      <CloudProvider>
        <TourProvider>
          <App />
          <Splash />
        </TourProvider>
      </CloudProvider>
    </StoreProvider>
  </React.StrictMode>,
);
