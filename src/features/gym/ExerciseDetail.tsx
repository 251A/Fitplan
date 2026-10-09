import { useMemo } from 'react';
import { useAppData } from '../../app/AppData';
import { dateKey } from '../../domain/dates';
import { doubleProgression, e1rmHistory, isStagnant, MUSCLE_LABEL } from '../../domain/strength/strength';
import { saveExercises } from '../../data/db/repository';
import type { Exercise } from '../../data/db/models';
import { TrendChart } from '../progress/TrendChart';
import { exerciseWeightLabel, kg, lastSetFor, sessionsWithSeed } from './gymStats';

export function ExerciseDetail({ exercise, onDone }: { exercise: Exercise; onDone: () => void }) {
  const { db, gymSessions, bestSets, timeZone, reload } = useAppData();
  const today = dateKey(Date.now(), timeZone);
  const history = useMemo(() => e1rmHistory(sessionsWithSeed(gymSessions, bestSets), exercise.id), [gymSessions, bestSets, exercise.id]);
  const last = lastSetFor(exercise.id, gymSessions, bestSets);
  const stagnant = isStagnant(history, today);

  const lastSession = gymSessions
    .filter((s) => s.date && s.sets.some((x) => x.exerciseId === exercise.id && !x.skipped))
    .sort((a, b) => b.date!.localeCompare(a.date!))[0];
  const progression = lastSession ? doubleProgression(lastSession.sets, exercise) : undefined;

  const rows = gymSessions
    .filter((s) => s.date && s.sets.some((x) => x.exerciseId === exercise.id))
    .sort((a, b) => b.date!.localeCompare(a.date!))
    .slice(0, 12);

  async function setLoadMode(loadMode: Exercise['loadMode']) {
    await saveExercises(db, [{ ...exercise, loadMode }]);
    await reload();
  }

  return (
    <div className="page">
      <header className="page-header">
        <button className="link-btn" onClick={onDone}>
          ‹ Volver
        </button>
        <h1 className="h1-small">{exercise.name}</h1>
        <p className="subtitle">
          {MUSCLE_LABEL[exercise.primaryMuscle]}
          {exercise.secondaryMuscles.length > 0 && ` · ${exercise.secondaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')}`}
        </p>
      </header>

      {exercise.loadMode === 'unconfirmed' && (
        <section className="card question">
          <p>¿El peso que apuntas en este ejercicio es de una mancuerna o del par?</p>
          <div className="row-gap">
            <button className="btn small" onClick={() => setLoadMode('perDumbbell')}>
              Por mancuerna
            </button>
            <button className="btn small" onClick={() => setLoadMode('total')}>
              Peso total
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <div className="metric-grid">
          <div>
            <div className="metric-label">Último peso</div>
            <div className="metric-value">{last ? `${exerciseWeightLabel(exercise, last.weightKg)} × ${last.reps}` : '—'}</div>
          </div>
          <div>
            <div className="metric-label">1RM estimado (mejor)</div>
            <div className="metric-value">{history.length ? kg(Math.max(...history.map((h) => h.e1rm))) : '—'}</div>
          </div>
        </div>
        {progression && (
          <p className="status ok">
            Todas las series llegaron al tope de repeticiones: prueba {exerciseWeightLabel(exercise, progression.nextWeightKg)} la próxima vez (+
            {kg(progression.increment)}).
          </p>
        )}
        {stagnant && <p className="status error">Sin mejora del 1RM estimado en las últimas 3 semanas.</p>}
      </section>

      {history.length > 0 && (
        <TrendChart
          title="1RM estimado (Epley)"
          kind="line"
          points={history.map((h) => ({ date: h.date, value: h.e1rm }))}
          format={(v) => kg(Math.round(v * 10) / 10)}
        />
      )}

      <section className="card">
        <h2>Historial</h2>
        {rows.length === 0 && <p className="metric-hint">Aún no hay sesiones con este ejercicio.</p>}
        <ul className="list">
          {rows.map((s) => (
            <li key={s.id}>
              <span>
                {new Date(`${s.date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {s.templateName}
              </span>
              <span className="muted">
                {s.sets
                  .filter((x) => x.exerciseId === exercise.id)
                  .map((x) => (x.skipped ? 'no hecho' : `${x.weightKg}×${x.reps}`))
                  .join(', ')}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
