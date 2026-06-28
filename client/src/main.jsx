import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { CategoryProvider } from './categories.jsx';
import { PermissionsProvider } from './permissions.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PermissionsProvider>
          <CategoryProvider>
            <App />
          </CategoryProvider>
        </PermissionsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
