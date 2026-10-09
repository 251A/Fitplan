import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppData';
import type { Exercise, GymSession } from '../../data/db/models';
import { ExerciseDetail } from './ExerciseDetail';
import { exerciseWeightLabel, lastSetFor } from './gymStats';
import { ImportFlow } from './ImportFlow';
import { SessionEditor } from './SessionEditor';

const CATEGORY_LABEL: Record<Exercise['category'], string> = { push: 'Empuje', pull: 'Tracción', legs: 'Pierna' };
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

type View = { kind: 'list' } | { kind: 'edit'; session?: GymSession } | { kind: 'import' } | { kind: 'exercise'; exercise: Exercise };

export function GymView() {
  const { exercises, bestSets, gymSessions } = useAppData();
  const [tab, setTab] = useState<'sessions' | 'exercises'>('sessions');
  const [view, setView] = useState<View>({ kind: 'list' });
  const back = () => setView({ kind: 'list' });

  const sessions = useMemo(
    () => [...gymSessions].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [gymSessions],
  );

  if (view.kind === 'edit') return <SessionEditor session={view.session} onDone={back} />;
  if (view.kind === 'import') return <ImportFlow onDone={back} />;
  if (view.kind === 'exercise') {
    const fresh = exercises.find((e) => e.id === view.exercise.id) ?? view.exercise;
    return <ExerciseDetail exercise={fresh} onDone={back} />;
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Gimnasio</h1>
      </header>

      <div className="row-gap" style={{ marginBottom: 12 }}>
        <button className="btn primary" onClick={() => setView({ kind: 'import' })}>
          Importar capturas
        </button>
        <button className="btn" onClick={() => setView({ kind: 'edit' })}>
          Registrar sesión
        </button>
      </div>

      <div className="range-tabs" role="group" aria-label="Vista">
        <button aria-pressed={tab === 'sessions'} onClick={() => setTab('sessions')}>
          Sesiones ({gymSessions.length})
        </button>
        <button aria-pressed={tab === 'exercises'} onClick={() => setTab('exercises')}>
          Ejercicios
        </button>
      </div>

      {tab === 'sessions' && (
        <section className="card">
          {sessions.length === 0 && (
            <p className="metric-hint">Aún no hay sesiones. Importa tus capturas de Symmetry o carga tus datos iniciales en Ajustes.</p>
          )}
          <ul className="list">
            {sessions.map((s) => {
              const done = s.sets.filter((x) => !x.skipped);
              const exCount = new Set(done.map((x) => x.exerciseId)).size;
              return (
                <li key={s.id} className="clickable" onClick={() => setView({ kind: 'edit', session: s })}>
                  <span>
                    <strong>{s.templateName}</strong>
                    {s.needsReview && <span className="tag">revisar</span>}
                    <br />
                    <span className="muted">{s.date ? shortDate(s.date) : 'sin fecha'}</span>
                  </span>
                  <span className="muted nowrap">
                    {s.summaryOnly || s.sets.length === 0 ? 'solo resumen' : `${exCount} ejerc. · ${done.length} series`} ›
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === 'exercises' &&
        (['push', 'pull', 'legs'] as const).map((cat) => (
          <section className="card" key={cat}>
            <h2>{CATEGORY_LABEL[cat]}</h2>
            <ul className="list">
              {exercises
                .filter((e) => e.category === cat)
                .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                .map((e) => {
                  const last = lastSetFor(e.id, gymSessions, bestSets);
                  return (
                    <li key={e.id} className="clickable" onClick={() => setView({ kind: 'exercise', exercise: e })}>
                      <span>
                        {e.name}
                        {e.loadMode === 'unconfirmed' && <span className="tag">¿mancuerna o par?</span>}
                      </span>
                      <span className="muted nowrap">{last ? `${exerciseWeightLabel(e, last.weightKg)} × ${last.reps}` : 'No realizado'} ›</span>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
    </div>
  );
}
