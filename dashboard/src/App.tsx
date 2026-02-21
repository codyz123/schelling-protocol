import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './lib/store';
import { api } from './lib/api';
import AuthGate from './components/AuthGate';
import TopNav from './components/TopNav';
import Dashboard from './pages/Dashboard';
import Simulator from './pages/Simulator';
import MatchInspector from './pages/MatchInspector';
import EventLog from './pages/EventLog';

function App() {
  const { adminToken, serverUrl } = useAppStore();

  // Sync API client with persisted store values on mount
  useEffect(() => {
    if (serverUrl) {
      api.setBaseUrl(serverUrl);
    }
    if (adminToken) {
      api.setAdminToken(adminToken);
    }
  }, [serverUrl, adminToken]);

  if (!adminToken) {
    return <AuthGate />;
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <TopNav />
        <main className="pt-16">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/simulator" element={<Simulator />} />
            <Route path="/inspector" element={<MatchInspector />} />
            <Route path="/events" element={<EventLog />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
