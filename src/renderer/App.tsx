import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './lib/store';
import { Shell, Toasts } from './components/Shell';
import { Banner, Button, Loading } from './components/ui';
import { Overview } from './pages/Overview';
import { Projects } from './pages/Projects';
import { Agents } from './pages/Agents';
import { Runs } from './pages/Runs';
import { Integrations } from './pages/Integrations';
import { Evaluation } from './pages/Evaluation';
import { Observability } from './pages/Observability';
import { Terminal } from './pages/Terminal';
import { Rebuild } from './pages/Rebuild';
import { Modules } from './pages/Modules';
import { Settings } from './pages/Settings';

export function App() {
  const { boot, booted, bootError, info } = useApp();

  useEffect(() => {
    void boot();
  }, [boot]);

  if (bootError) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24 }}>
        <div style={{ maxWidth: 560, width: '100%' }}>
          <Banner tone="err" title="ARQENIUM could not start">
            <p style={{ marginBottom: 10 }}>{bootError}</p>
            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              The renderer could not reach the application core. In the desktop app the core starts automatically; in the
              web runtime make sure the API server is running on the expected port.
            </p>
            <Button variant="primary" size="sm" onClick={() => void boot()}>
              Retry
            </Button>
          </Banner>
        </div>
      </div>
    );
  }

  if (!booted) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--accent)' }}>
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M10 25V15.2C10 11.8 12.7 9 16 9C19.3 9 22 11.8 22 15.2V25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="16" cy="15.5" r="2" fill="currentColor" />
            </svg>
          </span>
          <Loading label="Starting the ARQENIUM core" />
          <span className="mono dim" style={{ fontSize: 11 }}>
            {info ? `${info.name} v${info.version}` : ''}
          </span>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/runs" element={<Runs />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/evaluation" element={<Evaluation />} />
          <Route path="/observability" element={<Observability />} />
          <Route path="/terminal" element={<Terminal />} />
          <Route path="/rebuild" element={<Rebuild />} />
          <Route path="/modules" element={<Modules />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
      <Toasts />
    </HashRouter>
  );
}
