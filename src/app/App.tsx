import { useEffect, useState } from 'react';
import { TodayView } from '../features/today/TodayView';
import { GymView } from '../features/gym/GymView';
import { SettingsView } from '../features/settings/SettingsView';
import { ProgressView } from '../features/progress/ProgressView';
import { WeekView } from '../features/week/WeekView';
import { CardioView } from '../features/cardio/CardioView';

type Tab = 'today' | 'week' | 'gym' | 'cardio' | 'progress' | 'settings';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'today', label: 'Hoy', icon: '●' },
  { id: 'week', label: 'Semana', icon: '▦' },
  { id: 'gym', label: 'Gimnasio', icon: '▮' },
  { id: 'cardio', label: 'Cardio', icon: '〜' },
  { id: 'progress', label: 'Progreso', icon: '↗' },
  { id: 'settings', label: 'Ajustes', icon: '⚙' },
];

function readTab(): Tab {
  const t = location.hash.replace('#', '') as Tab;
  return TABS.some((x) => x.id === t) ? t : 'today';
}

export function App() {
  const [tab, setTab] = useState<Tab>(readTab);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="app">
      <main className="content">
        {tab === 'today' && <TodayView />}
        {tab === 'week' && <WeekView />}
        {tab === 'gym' && <GymView />}
        {tab === 'cardio' && <CardioView />}
        {tab === 'progress' && <ProgressView />}
        {tab === 'settings' && <SettingsView />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} className={t.id === tab ? 'active' : ''} aria-current={t.id === tab}>
            <span className="tab-icon" aria-hidden>
              {t.icon}
            </span>
            <span className="tab-label">{t.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
