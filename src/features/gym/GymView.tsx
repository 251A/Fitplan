import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppData';
import type { Exercise, GymSession } from '../../data/db/models';
import { ExerciseDetail } from './ExerciseDetail';
import { exerciseWeightLabel, lastSetFor } from './gymStats';
import { ImportFlow } from './ImportFlow';
import { SymmetryLiveTracker } from './SymmetryLiveTracker';
import { SymmetryLoginModal } from './SymmetryLoginModal';
import {
  SYMMETRY_EXERCISES,
  calculateSymmetryRank,
  IMPLEMENT_LABELS,
  type SymmetryExercise,
} from '../../data/symmetry/symmetryCatalog';
import { isSymmetryConnected } from '../../data/symmetry/symmetryApi';
import './symmetryTheme.css';

const shortDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

type View =
  | { kind: 'list' }
  | { kind: 'live'; templateName?: string; exercises?: SymmetryExercise[]; session?: GymSession }
  | { kind: 'import' }
  | { kind: 'exercise'; exercise: Exercise };

// Quick routines using Symmetry canonical exercises
const QUICK_ROUTINES: {
  id: string;
  title: string;
  desc: string;
  exerciseIds: number[];
}[] = [
  {
    id: 'push-a',
    title: 'Empuje A (Pecho / Hombro / Tríceps)',
    desc: 'Banca barra, militar mancuernas, aperturas y tríceps',
    exerciseIds: [16, 39, 21, 41, 67],
  },
  {
    id: 'pull-a',
    title: 'Tracción A (Espalda / Bíceps)',
    desc: 'Jalón al pecho, remo con barra, face pull y curl mancuernas',
    exerciseIds: [48, 53, 55, 44, 61],
  },
  {
    id: 'legs-a',
    title: 'Pierna A (Cuádriceps / Femoral)',
    desc: 'Sentadilla barra, prensa, curl femoral y gemelos',
    exerciseIds: [1, 2, 7, 5, 11],
  },
  {
    id: 'upper-b',
    title: 'Torso B (Hipertrofia)',
    desc: 'Inclinado mancuernas, dominadas, fondos y martillo',
    exerciseIds: [18, 49, 23, 63, 68],
  },
];

const MUSCLE_FILTER_OPTIONS: { key: string; label: string; svg?: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'chest', label: 'Pecho', svg: '/symmetry/icons/muscles/pecho.svg' },
  { key: 'back', label: 'Espalda', svg: '/symmetry/icons/muscles/dorsales.svg' },
  { key: 'shoulders', label: 'Hombros', svg: '/symmetry/icons/muscles/hombros.svg' },
  { key: 'biceps', label: 'Bíceps', svg: '/symmetry/icons/muscles/biceps.svg' },
  { key: 'triceps', label: 'Tríceps', svg: '/symmetry/icons/muscles/triceps.svg' },
  { key: 'quads', label: 'Pierna', svg: '/symmetry/icons/muscles/cuadriceps.svg' },
];

export function GymView() {
  const { exercises, bestSets, gymSessions, profile, days } = useAppData();
  const [tab, setTab] = useState<'sessions' | 'exercises' | 'routines'>('sessions');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogMuscle, setCatalogMuscle] = useState('all');

  const back = () => setView({ kind: 'list' });

  // Body weight for ranking calculation
  const userWeightKg = useMemo(() => {
    if (profile?.startWeightKg && profile.startWeightKg > 0) return profile.startWeightKg;
    const lastDayWeight = days.find((d) => d.bodyMassKg && d.bodyMassKg > 0)?.bodyMassKg;
    return lastDayWeight && lastDayWeight > 0 ? lastDayWeight : 75;
  }, [profile, days]);

  const sessions = useMemo(
    () => [...gymSessions].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [gymSessions],
  );

  const connected = isSymmetryConnected();

  // Launch routine by preset
  function startRoutine(routineId: string) {
    const routine = QUICK_ROUTINES.find((r) => r.id === routineId);
    if (!routine) return;
    const exList = routine.exerciseIds
      .map((id) => SYMMETRY_EXERCISES.find((e) => e.id === id))
      .filter((e): e is SymmetryExercise => Boolean(e));
    setView({ kind: 'live', templateName: routine.title, exercises: exList });
  }

  // Filtered exercises for catalog
  const filteredCatalog = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    return SYMMETRY_EXERCISES.filter((ex) => {
      const matchQ =
        !q ||
        ex.name.toLowerCase().includes(q) ||
        (IMPLEMENT_LABELS[ex.implement] ?? ex.implement).toLowerCase().includes(q);
      const matchM =
        catalogMuscle === 'all' ||
        ex.primaryMuscle === catalogMuscle ||
        (catalogMuscle === 'quads' &&
          ['quads', 'hamstrings', 'glutes', 'calves'].includes(ex.primaryMuscle));
      return matchQ && matchM;
    });
  }, [catalogQuery, catalogMuscle]);

  if (view.kind === 'live') {
    return (
      <SymmetryLiveTracker
        initialTemplateName={view.templateName}
        initialExercises={view.exercises}
        existingSession={view.session}
        onDone={back}
      />
    );
  }

  if (view.kind === 'import') return <ImportFlow onDone={back} />;

  if (view.kind === 'exercise') {
    const fresh = exercises.find((e) => e.id === view.exercise.id) ?? view.exercise;
    return <ExerciseDetail exercise={fresh} onDone={back} />;
  }

  return (
    <div className="symmetry-container">
      {/* Top Header */}
      <header className="symmetry-topbar">
        <div className="symmetry-brand">
          <div className="symmetry-logo-icon">
            <img
              src="/symmetry/icons/symmetry_logo.svg"
              alt="Symmetry"
              style={{ width: 16, height: 16 }}
            />
          </div>
          <div>
            <h1 className="symmetry-brand-title">SYMMETRY</h1>
          </div>
        </div>

        <button
          type="button"
          className={`symmetry-sync-pill ${connected ? '' : 'disconnected'}`}
          onClick={() => setShowLoginModal(true)}
          title="Gestionar sincronización con Symmetry"
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: connected ? 'var(--sym-emerald)' : 'var(--sym-text-muted)',
            }}
          />
          {connected ? 'Cloud On' : 'Conectar'}
        </button>
      </header>

      {/* Hero Action Buttons */}
      <div className="symmetry-hero-actions">
        <button
          type="button"
          className="sym-btn-primary"
          onClick={() => setView({ kind: 'live', templateName: 'Entrenamiento' })}
        >
          <img
            src="/symmetry/icons/dumbell_icon.svg"
            alt=""
            style={{ width: 18, height: 18, filter: 'invert(1)' }}
          />
          Iniciar Sesión
        </button>

        <button
          type="button"
          className="sym-btn-secondary"
          onClick={() => setView({ kind: 'import' })}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Importar OCR
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <nav className="sym-nav-tabs">
        <button
          type="button"
          className={`sym-nav-tab ${tab === 'sessions' ? 'active' : ''}`}
          onClick={() => setTab('sessions')}
        >
          Sesiones ({sessions.length})
        </button>
        <button
          type="button"
          className={`sym-nav-tab ${tab === 'routines' ? 'active' : ''}`}
          onClick={() => setTab('routines')}
        >
          Rutinas
        </button>
        <button
          type="button"
          className={`sym-nav-tab ${tab === 'exercises' ? 'active' : ''}`}
          onClick={() => setTab('exercises')}
        >
          Ejercicios y Rangos ({SYMMETRY_EXERCISES.length})
        </button>
      </nav>

      {/* SESSIONS LIST TAB */}
      {tab === 'sessions' && (
        <section>
          {sessions.length === 0 ? (
            <div
              style={{
                background: 'var(--sym-surface)',
                borderRadius: 16,
                padding: '32px 16px',
                textAlign: 'center',
                border: '1px dashed var(--sym-border)',
              }}
            >
              <img
                src="/symmetry/icons/dumbell_icon.svg"
                alt=""
                style={{ width: 36, height: 36, opacity: 0.35, marginBottom: 8, filter: 'invert(1)' }}
              />
              <p style={{ color: 'var(--sym-text-muted)', margin: 0, fontSize: 14 }}>
                Aún no tienes entrenamientos guardados. Inicia una sesión con el botón superior o
                importa tus capturas.
              </p>
            </div>
          ) : (
            sessions.map((s) => {
              const doneSets = s.sets.filter((x) => !x.skipped);
              const exerciseIds = new Set(doneSets.map((x) => x.exerciseId));
              const totalKg = doneSets.reduce((acc, x) => acc + x.weightKg * x.reps, 0);

              return (
                <div
                  key={s.id}
                  className="sym-workout-card"
                  onClick={() => setView({ kind: 'live', session: s })}
                  role="button"
                  tabIndex={0}
                >
                  <div className="sym-workout-card-header">
                    <div>
                      <h3 className="sym-workout-title">
                        {s.templateName || 'Entrenamiento'}
                        {s.needsReview && (
                          <span
                            className="sym-tag-pill"
                            style={{
                              marginLeft: 6,
                              background: 'rgba(239, 68, 68, 0.2)',
                              color: '#f87171',
                            }}
                          >
                            Revisar
                          </span>
                        )}
                      </h3>
                      <div className="sym-workout-date">
                        {s.date ? shortDate(s.date) : 'Sin fecha'}
                        {s.durationMin ? ` · ${s.durationMin} min` : ''}
                      </div>
                    </div>

                    <span className="sym-workout-stats-badge">
                      {s.summaryOnly || doneSets.length === 0
                        ? 'Resumen'
                        : `${totalKg > 0 ? `${totalKg.toLocaleString('es-ES')} kg · ` : ''}${exerciseIds.size} ej · ${doneSets.length} series`}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 8,
                      fontSize: 12,
                      color: 'var(--sym-text-muted)',
                    }}
                  >
                    <span>Fuente: {s.source === 'symmetry' ? 'Symmetry App' : s.source}</span>
                    <span style={{ color: 'var(--sym-blue)', fontWeight: 600 }}>Abrir sesión ›</span>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {/* QUICK ROUTINES TAB */}
      {tab === 'routines' && (
        <section>
          <div style={{ marginBottom: 12, color: 'var(--sym-text-muted)', fontSize: 13 }}>
            Rutinas canónicas de Symmetry listas para iniciar en 1 toque sin suscripción Pro:
          </div>

          <div className="sym-routine-grid">
            {QUICK_ROUTINES.map((r) => (
              <div
                key={r.id}
                className="sym-routine-card"
                onClick={() => startRoutine(r.id)}
                role="button"
                tabIndex={0}
              >
                <h3 className="sym-routine-title">
                  {r.title}
                  <span style={{ color: 'var(--sym-emerald)', fontSize: 13 }}>Iniciar ›</span>
                </h3>
                <p className="sym-routine-desc">{r.desc}</p>
                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="sym-tag-pill">{r.exerciseIds.length} ejercicios</span>
                  <span
                    className="sym-tag-pill"
                    style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--sym-emerald)' }}
                  >
                    Ilimitado
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* EXERCISES & RANKINGS CATALOG TAB */}
      {tab === 'exercises' && (
        <section>
          <input
            type="search"
            className="sym-search-input"
            placeholder="Buscar entre los 155 ejercicios y rangos..."
            value={catalogQuery}
            onChange={(e) => setCatalogQuery(e.target.value)}
          />

          <div className="sym-muscle-scroller">
            {MUSCLE_FILTER_OPTIONS.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`sym-muscle-chip ${catalogMuscle === m.key ? 'active' : ''}`}
                onClick={() => setCatalogMuscle(m.key)}
              >
                {m.svg && <img src={m.svg} alt="" />}
                {m.label}
              </button>
            ))}
          </div>

          <div className="sym-rank-grid">
            {filteredCatalog.map((symEx) => {
              // Lookup historical performance
              const matchingEx = exercises.find(
                (e) =>
                  e.name.toLowerCase() === symEx.name.toLowerCase() || e.id === String(symEx.id),
              );
              const exId = matchingEx ? matchingEx.id : `sym-${symEx.id}`;
              const last = lastSetFor(exId, gymSessions, bestSets);

              let rank = null;
              if (last && last.weightKg > 0) {
                const oneRepMax =
                  last.reps === 1 ? last.weightKg : last.weightKg * (1 + last.reps / 30);
                rank = calculateSymmetryRank(symEx.id, oneRepMax, userWeightKg, 'male');
              } else {
                // Default unranked / Iron 1
                rank = calculateSymmetryRank(symEx.id, 0.01, userWeightKg, 'male');
              }

              const rankSvg = rank?.svg ?? '/symmetry/icons/ranking/rank=iron1.svg';
              const tierName = rank?.name ?? 'Hierro I';
              const tierColor = rank?.color ?? '#6b7280';
              const progress = rank?.progressPercent ?? 0;
              const implementLabel = IMPLEMENT_LABELS[symEx.implement] ?? symEx.implement;

              return (
                <div
                  key={symEx.id}
                  className="sym-rank-card"
                  onClick={() => {
                    if (matchingEx) {
                      setView({ kind: 'exercise', exercise: matchingEx });
                    } else {
                      // Launch session with this exercise
                      setView({
                        kind: 'live',
                        templateName: symEx.name,
                        exercises: [symEx],
                      });
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="sym-rank-card-badge">
                    <img src={rankSvg} alt={tierName} />
                  </div>

                  <div className="sym-rank-card-content">
                    <div className="sym-rank-card-title">{symEx.name}</div>
                    <div className="sym-rank-card-tier" style={{ color: tierColor }}>
                      <span>{tierName}</span>
                      <span className="sym-tag-pill">{implementLabel}</span>
                    </div>

                    <div className="sym-progress-bar">
                      <div
                        className="sym-progress-fill"
                        style={{
                          width: `${progress}%`,
                          background: tierColor,
                        }}
                      />
                    </div>

                    <div className="sym-rank-ratio-text">
                      <span>
                        {last ? `${exerciseWeightLabel(matchingEx ?? ({} as Exercise), last.weightKg)} × ${last.reps}` : 'Sin marcas'}
                      </span>
                      <span>{progress}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Symmetry Cloud Login Modal */}
      {showLoginModal && (
        <SymmetryLoginModal
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </div>
  );
}
