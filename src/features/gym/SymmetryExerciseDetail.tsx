import { useMemo } from 'react';
import { useAppData } from '../../app/AppData';
import { e1rmHistory, type E1RMPoint } from '../../domain/strength/strength';
import { IMPLEMENT_LABELS, type SymmetryExercise } from '../../data/symmetry/symmetryCatalog';
import { symmetryExerciseFor, userExerciseRanks } from '../../data/symmetry/userRanks';
import { TrendChart } from '../progress/TrendChart';
import { SymmetryExerciseVideo } from './components/SymmetryExerciseVideo';
import { kg, sessionsWithSeed } from './gymStats';

const CATALOG_MUSCLE_LABEL: Record<string, string> = {
  chest: 'Pecho',
  back: 'Espalda',
  delts: 'Hombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  quads: 'Cuádriceps',
  hamstrings: 'Isquiosurales',
  glutes: 'Glúteos',
  calves: 'Gemelos',
  abs: 'Abdominales',
};

interface Props {
  exercise: SymmetryExercise;
  userWeightKg: number;
  onBack: () => void;
  onStart: (exercise: SymmetryExercise) => void;
}

export function SymmetryExerciseDetail({ exercise, userWeightKg, onBack, onStart }: Props) {
  const { gymSessions, bestSets, exercises } = useAppData();

  // FitPlan ids logged for this catalog exercise (exact name/alias match or the numeric Symmetry id).
  const linkedIds = useMemo(() => {
    const ids = new Set<string>([String(exercise.id)]);
    for (const e of exercises) if (symmetryExerciseFor(e.id, exercises)?.id === exercise.id) ids.add(e.id);
    return [...ids];
  }, [exercises, exercise.id]);

  const history = useMemo(() => {
    const all = sessionsWithSeed(gymSessions, bestSets);
    const byDate = new Map<string, number>();
    for (const id of linkedIds) {
      for (const p of e1rmHistory(all, id)) byDate.set(p.date, Math.max(byDate.get(p.date) ?? 0, p.e1rm));
    }
    return [...byDate.entries()]
      .map(([date, e1rm]): E1RMPoint => ({ date, e1rm }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [gymSessions, bestSets, linkedIds]);

  const rank = useMemo(
    () => userExerciseRanks(gymSessions, bestSets, exercises, userWeightKg).find((r) => r.exercise.id === exercise.id),
    [gymSessions, bestSets, exercises, userWeightKg, exercise.id],
  );

  return (
    <div
      className="symmetry-screen-root"
      style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#090a0c', color: '#ffffff', padding: '12px 14px 40px', boxSizing: 'border-box' }}
    >
      <button
        type="button"
        onClick={onBack}
        style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 14, fontWeight: 700, padding: '4px 0', cursor: 'pointer' }}
      >
        ‹ Volver
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 900, margin: '8px 0 4px', lineHeight: 1.2 }}>{exercise.name}</h1>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {[CATALOG_MUSCLE_LABEL[exercise.primaryMuscle] ?? exercise.primaryMuscle, IMPLEMENT_LABELS[exercise.implement] ?? exercise.implement].map(
          (label) => (
            <span key={label} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#16181e', color: '#9ca3af' }}>
              {label}
            </span>
          ),
        )}
      </div>

      <SymmetryExerciseVideo exercise={exercise} />

      <section
        style={{ marginTop: 16, padding: 14, borderRadius: 16, background: '#121317', border: '1px solid #1f2127', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
      >
        <div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Mejor serie</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{rank ? `${kg(rank.weightKg)} × ${rank.reps}` : '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>1RM estimado</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{history.length ? kg(Math.round(Math.max(...history.map((h) => h.e1rm)) * 10) / 10) : '—'}</div>
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
          {rank && rank.tierIndex >= 0 ? (
            <>
              <img src={rank.rank.svg} alt="" width={36} height={36} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: rank.rank.color }}>{rank.rank.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  {rank.rank.ratio.toFixed(2)}x tu peso
                  {rank.rank.nextThreshold !== null && ` · ${rank.rank.progressPercent}% hacia el siguiente rango`}
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              {exercise.rankThresholds
                ? rank
                  ? `Aún por debajo de Hierro I (${rank.rank.ratio.toFixed(2)}x tu peso).`
                  : 'Sin marcas registradas en este ejercicio.'
                : 'Este ejercicio no tiene rangos en Symmetry.'}
            </div>
          )}
        </div>
      </section>

      {history.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <TrendChart
            title="1RM estimado (Epley)"
            kind="line"
            points={history.map((h) => ({ date: h.date, value: h.e1rm }))}
            format={(v) => kg(Math.round(v * 10) / 10)}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => onStart(exercise)}
        style={{
          width: '100%',
          marginTop: 18,
          padding: 14,
          borderRadius: 14,
          background: '#2563eb',
          color: '#ffffff',
          border: 'none',
          fontWeight: 800,
          fontSize: 15,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
        }}
      >
        ▶ Entrenar este ejercicio
      </button>
    </div>
  );
}
