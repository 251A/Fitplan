import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppData';
import type { GymSession, Exercise } from '../../data/db/models';
import { ExerciseDetail } from './ExerciseDetail';
import { ImportFlow } from './ImportFlow';
import { SymmetryLiveTracker, type SymmetryTrackerInitialExercise } from './SymmetryLiveTracker';
import { SymmetryExercisePicker } from './SymmetryExercisePicker';
import { SymmetryExerciseVisual } from './SymmetryExerciseVisual';
import { SymmetryBodySilhouette } from './SymmetryBodySilhouette';
import { SymmetryBodyScanCard } from './components/SymmetryBodyScanCard';
import { SymmetryRanksView } from './SymmetryRanksView';
import {
  SymmetryBibliotecaView,
  DEFAULT_TEMPLATES,
  loadSavedCustomRoutines,
  type RoutineTemplate,
} from './SymmetryBibliotecaView';
import { ROUTINE_COLLAGES } from './SymmetryExerciseVisual';
import { assetUrl } from '../../data/symmetry/assetHelper';
import {
  getAllQuickWorkouts,
  MUSCLE_GROUP_LABELS,
  type QuickWorkout,
} from '../../data/symmetry/quickWorkouts';
import {
  findSymmetryExercise,
  type SymmetryExercise,
} from '../../data/symmetry/symmetryCatalog';
import { isSymmetryConnected } from '../../data/symmetry/symmetryApi';
import { SymmetryLoginModal } from './SymmetryLoginModal';
import { SymmetryExerciseDetail } from './SymmetryExerciseDetail';
import { SymmetryIcon } from './components/SymmetryIcon';
import { LOTTIE, SymmetryLottie } from './components/SymmetryLottie';
import { addDays, dateKey } from '../../domain/dates';
import {
  personalRecords,
  trainedDays,
  weeklyStreak,
  weeklyVolumeSeries,
} from '../../domain/strength/gymActivity';
import './symmetryTheme.css';

type NavTab = 'friends' | 'ranks' | 'train' | 'library' | 'profile';

const NAV_ITEMS: { tab: NavTab; label: string; icon: string }[] = [
  { tab: 'friends', label: 'Amigos', icon: 'navigation_bar/social_media_icon' },
  { tab: 'ranks', label: 'Rangos', icon: 'ranks_icon' },
  { tab: 'train', label: 'Entrenar', icon: 'navigation_bar/start_training_icon' },
  { tab: 'library', label: 'Biblioteca', icon: 'icon_exercises' },
  { tab: 'profile', label: 'Perfil', icon: 'navigation_bar/profile_icon' },
];

const HEATMAP_DAYS = 84;

type View =
  | { kind: 'main' }
  | { kind: 'live'; templateName?: string; exercises?: SymmetryTrackerInitialExercise[]; session?: GymSession }
  | { kind: 'exercise'; exercise: Exercise }
  | { kind: 'symExercise'; exercise: SymmetryExercise }
  | { kind: 'import' };

const compactKg = (v: number) =>
  v >= 1000
    ? `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(v / 1000)} mil kg`
    : `${Math.round(v)} kg`;

function deltaLabel(current: number, previous: number): { text: string; up: boolean } | null {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return { text: `${pct >= 0 ? '+' : ''}${pct}%`, up: pct >= 0 };
}

function formatSessionDate(dateStr?: string | null): string {
  if (!dateStr) return 'Reciente';
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr === today) return 'Hoy';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

function formatSessionDuration(durationMin?: number): string {
  if (!durationMin || durationMin <= 0) return '45m';
  if (durationMin >= 60) {
    const h = Math.floor(durationMin / 60);
    const m = durationMin % 60;
    return m > 0 ? `${h}h${m}m` : `${h}h`;
  }
  return `${durationMin}m`;
}

export function GymView() {
  const { exercises, bestSets, gymSessions, profile, days, timeZone } = useAppData();
  const [navTab, setNavTab] = useState<NavTab>('train');
  const [profileSubTab, setProfileSubTab] = useState<'workouts' | 'stats'>('workouts');
  const [view, setView] = useState<View>({ kind: 'main' });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);

  // Train tab state
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<GymSession | null>(null);
  const [showSymmetryWorkouts, setShowSymmetryWorkouts] = useState(false);
  const [routineMuscle, setRoutineMuscle] = useState('all');

  const back = () => setView({ kind: 'main' });

  // User templates (saved custom + default FitPlan templates)
  const myRoutines = useMemo(() => {
    const custom = loadSavedCustomRoutines();
    return [...custom, ...DEFAULT_TEMPLATES];
  }, [navTab]);

  const userWeightKg = useMemo(() => {
    if (profile?.startWeightKg && profile.startWeightKg > 0) return profile.startWeightKg;
    const lastDayWeight = days.find((d) => d.bodyMassKg && d.bodyMassKg > 0)?.bodyMassKg;
    return lastDayWeight && lastDayWeight > 0 ? lastDayWeight : 75;
  }, [profile, days]);

  const sortedSessions = useMemo(() => {
    return [...gymSessions].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [gymSessions]);

  // Activity summaries from the logged sessions (deterministic, see domain/strength/gymActivity).
  const today = dateKey(Date.now(), timeZone);
  const streakWeeks = useMemo(() => weeklyStreak(gymSessions, today), [gymSessions, today]);
  const volumeSeries = useMemo(() => weeklyVolumeSeries(gymSessions, today, 8), [gymSessions, today]);
  const prs = useMemo(() => personalRecords(gymSessions), [gymSessions]);
  const prDates = useMemo(() => new Set(prs.map((p) => p.date)), [prs]);
  const heatmap = useMemo(() => trainedDays(gymSessions, today, HEATMAP_DAYS), [gymSessions, today]);
  const last30 = addDays(today, -29);
  const prev30 = addDays(today, -59);
  const sessionsLast30 = gymSessions.filter((s) => s.date && s.date >= last30 && s.date <= today).length;
  const sessionsPrev30 = gymSessions.filter((s) => s.date && s.date >= prev30 && s.date < last30).length;
  const prsLast30 = prs.filter((p) => p.date >= last30).length;
  const prsPrev30 = prs.filter((p) => p.date >= prev30 && p.date < last30).length;

  const exerciseName = (id: string) => exercises.find((e) => e.id === id)?.name ?? findSymmetryExercise(id)?.name ?? id;

  const openSymmetryExercise = (ex: SymmetryExercise) => setView({ kind: 'symExercise', exercise: ex });

  const connected = isSymmetryConnected();
  const allQuickRoutines = useMemo(() => getAllQuickWorkouts(), []);

  const filteredQuickRoutines = useMemo(() => {
    if (routineMuscle === 'all') return allQuickRoutines.slice(0, 15);
    return allQuickRoutines.filter((r) => r.muscleGroupId === routineMuscle).slice(0, 15);
  }, [allQuickRoutines, routineMuscle]);

  // Repeat past session
  const handleRepeatSession = (s: GymSession) => {
    const exMap = new Map<string, SymmetryTrackerInitialExercise>();
    for (const st of s.sets) {
      if (!exMap.has(st.exerciseId)) {
        const symEx = findSymmetryExercise(st.exerciseId);
        const fitplanEx = exercises.find((e) => e.id === st.exerciseId);
        const name = fitplanEx?.name || symEx?.name || st.exerciseId;
        exMap.set(st.exerciseId, {
          id: symEx?.id ?? 0,
          name,
          category: (symEx?.category as any) ?? 'push',
          implement: symEx?.implement ?? 'dumbbell',
          primaryMuscle: symEx?.primaryMuscle ?? 'chest',
          loggedUnit: 'kg',
          loadDivisor: symEx?.loadDivisor ?? 1,
          rankThresholds: symEx?.rankThresholds ?? null,
          targetSets: s.sets.filter((x) => x.exerciseId === st.exerciseId).length || 3,
          targetReps: st.reps || 10,
        });
      }
    }

    setSelectedSessionDetail(null);
    setView({
      kind: 'live',
      templateName: s.templateName || 'Entrenamiento Repetido',
      exercises: Array.from(exMap.values()),
    });
  };

  // Launch routine from templates
  const handleStartRoutine = (tpl: RoutineTemplate) => {
    const tplExercises: SymmetryTrackerInitialExercise[] = tpl.exerciseIds
      .map((id) => findSymmetryExercise(id))
      .filter((e): e is SymmetryExercise => Boolean(e))
      .map((e) => ({
        ...e,
        targetSets: 3,
        targetReps: 10,
      }));

    setView({
      kind: 'live',
      templateName: tpl.name,
      exercises: tplExercises,
    });
  };

  // Launch quick workout
  const handleStartQuickWorkout = (routine: QuickWorkout) => {
    const exList: SymmetryTrackerInitialExercise[] = routine.exercises.map((e) => {
      const symEx = findSymmetryExercise(e.exerciseTemplateId || e.name);
      return {
        id: e.exerciseTemplateId,
        name: e.name,
        category: (symEx?.category as any) ?? 'push',
        implement: symEx?.implement ?? 'dumbbell',
        primaryMuscle: symEx?.primaryMuscle ?? 'chest',
        loggedUnit: 'kg',
        loadDivisor: symEx?.loadDivisor ?? 1,
        rankThresholds: symEx?.rankThresholds ?? null,
        targetSets: e.numberOfSets,
        targetReps: e.repsPerSet,
      };
    });

    const muscleLabel = MUSCLE_GROUP_LABELS[routine.muscleGroupId] || routine.name;
    setView({
      kind: 'live',
      templateName: `${routine.name} (${muscleLabel})`,
      exercises: exList,
    });
  };

  // Switch to live tracker or sub views
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

  if (view.kind === 'import') {
    return <ImportFlow onDone={back} />;
  }

  if (view.kind === 'exercise') {
    const fresh = exercises.find((e) => e.id === view.exercise.id) ?? view.exercise;
    return <ExerciseDetail exercise={fresh} onDone={back} />;
  }

  if (view.kind === 'symExercise') {
    return (
      <SymmetryExerciseDetail
        exercise={view.exercise}
        userWeightKg={userWeightKg}
        onBack={back}
        onStart={(ex) => setView({ kind: 'live', templateName: ex.name, exercises: [ex] })}
      />
    );
  }

  return (
    <div
      className="symmetry-screen-root"
      style={{
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100vh',
        background: '#090a0c',
        color: '#ffffff',
        padding: '12px 14px calc(140px + env(safe-area-inset-bottom, 0px))',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* ============================================================== */}
      {/* TAB 1: AMIGOS / SOCIAL */}
      {/* ============================================================== */}
      {navTab === 'friends' && (
        <div>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>Amigos</h1>
            <span style={{ fontSize: 13, color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
              <SymmetryLottie
                src={LOTTIE.streakFlame}
                size={24}
                fallback={<SymmetryIcon name="streak/flame_lit" mode="original" size={16} />}
              />
              {streakWeeks} {streakWeeks === 1 ? 'semana' : 'semanas'} de racha
            </span>
          </header>

          <div
            style={{
              borderRadius: 18,
              background: '#121317',
              border: '1px solid #1f2127',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#1c1e26', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
              👥
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px' }}>Comunidad Symmetry</h3>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 20px', lineHeight: 1.4 }}>
              Conecta con amigos para comparar rankings musculares, récords personales y rachas de entrenamiento.
            </p>

            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 12,
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {connected ? 'Sincronizado con Symmetry Cloud' : 'Iniciar Sesión en Symmetry'}
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: RANGOS / RANKINGS */}
      {/* ============================================================== */}
      {navTab === 'ranks' && (
        <SymmetryRanksView
          gymSessions={gymSessions}
          bestSets={bestSets}
          exercises={exercises}
          userWeightKg={userWeightKg}
          streakWeeks={streakWeeks}
          onSelectExercise={openSymmetryExercise}
        />
      )}

      {/* ============================================================== */}
      {/* TAB 3: ENTRENAR (Workout Hub) */}
      {/* ============================================================== */}
      {navTab === 'train' && (
        <div>
          {/* Top Header */}
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              padding: '0 2px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img
                src={assetUrl('symmetry/symmetry_letters_logo.svg')}
                alt="Symmetry"
                style={{ height: 22, filter: 'brightness(0) invert(1)' }}
              />
            </div>

            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                background: connected ? 'rgba(16, 185, 129, 0.15)' : '#16181e',
                border: `1px solid ${connected ? '#10b981' : '#282b36'}`,
                color: connected ? '#10b981' : '#9ca3af',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: connected ? '#10b981' : '#6b7280',
                }}
              />
              {connected ? 'Cloud Activo' : 'Conectar Cuenta'}
            </button>
          </header>

          {/* Big Action Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => setView({ kind: 'live', templateName: 'Entrenamiento Libre' })}
              style={{
                padding: '12px 6px',
                borderRadius: 14,
                background: '#ffffff',
                color: '#000000',
                border: 'none',
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
              }}
            >
              <span aria-hidden="true">🏋️</span> Entrenar
            </button>

            <button
              type="button"
              onClick={() => setShowExercisePicker(true)}
              style={{
                padding: '12px 6px',
                borderRadius: 14,
                background: 'var(--sym-card)',
                color: '#ffffff',
                border: '1px solid var(--sym-border)',
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
              aria-label="Añadir ejercicio"
            >
              <span aria-hidden="true">＋</span> Ejercicio
            </button>

            <button
              type="button"
              onClick={() => setView({ kind: 'import' })}
              style={{
                padding: '12px 6px',
                borderRadius: 14,
                background: '#16181e',
                color: '#ffffff',
                border: '1px solid #282b36',
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <span aria-hidden="true">📸</span> Importar OCR
            </button>
          </div>

          {/* ========================================================== */}
          {/* 1. MIS PLANTILLAS DE ENTRENAMIENTO */}
          {/* ========================================================== */}
          <section style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#ffffff' }}>Mis Plantillas</h2>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  {myRoutines.length} rutinas de entrenamiento listas
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNavTab('library')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  background: '#1a1c22',
                  border: '1px solid #282b36',
                  color: '#38bdf8',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>+</span> Crear Rutina
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myRoutines.map((tpl) => {
                const collage = ROUTINE_COLLAGES[tpl.collageKey || tpl.id];
                const collageUrl = collage ? assetUrl(collage) : null;

                return (
                  <div
                    key={tpl.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: 16,
                      background: '#121317',
                      border: '1px solid #1e2027',
                    }}
                  >
                    {/* Routine Thumbnail */}
                    <div
                      style={{
                        position: 'relative',
                        width: 64,
                        height: 64,
                        borderRadius: 12,
                        overflow: 'hidden',
                        background: '#181a20',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {collageUrl ? (
                        <img
                          src={collageUrl}
                          alt={tpl.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 2,
                            width: '100%',
                            height: '100%',
                            padding: 4,
                            boxSizing: 'border-box',
                          }}
                        >
                          {tpl.exerciseIds.slice(0, 4).map((exId) => {
                            const ex = findSymmetryExercise(exId);
                            return (
                              <SymmetryExerciseVisual
                                key={exId}
                                exercise={ex || { id: exId }}
                                size={26}
                              />
                            );
                          })}
                        </div>
                      )}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 2,
                          left: 2,
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '1px 5px',
                          borderRadius: 4,
                          background: 'rgba(0,0,0,0.75)',
                          color: '#ffffff',
                        }}
                      >
                        ⏱ {tpl.durationMin || 50}m
                      </div>
                    </div>

                    {/* Routine Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', marginBottom: 2 }}>
                        {tpl.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>
                        {tpl.exerciseIds.length} ejercicios · {tpl.muscleDistribution?.map((m) => m.label).slice(0, 2).join(', ') || 'Fuerza'}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {tpl.muscleDistribution?.slice(0, 3).map((m) => (
                          <span
                            key={m.muscle}
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: '#1a1c24',
                              color: '#9ca3af',
                            }}
                          >
                            {m.label} {m.percent}%
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      type="button"
                      onClick={() => handleStartRoutine(tpl)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 12,
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(37,99,235,0.4)',
                      }}
                    >
                      ▶ Iniciar
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ========================================================== */}
          {/* 2. MIS SESIONES DE ENTRENAMIENTO */}
          {/* ========================================================== */}
          <section style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#ffffff' }}>Mis Sesiones</h2>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  {sortedSessions.length} entrenamientos completados
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 700 }}>
                Ver Todo
              </span>
            </div>

            {sortedSessions.length === 0 ? (
              <div
                style={{
                  borderRadius: 16,
                  background: '#121317',
                  border: '1px solid #1f2127',
                  padding: 28,
                  textAlign: 'center',
                  color: '#6b7280',
                }}
              >
                <div style={{ fontSize: 30, marginBottom: 8 }}>🏋️‍♂️</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', marginBottom: 4 }}>
                  Sin sesiones registradas aún
                </div>
                <p style={{ fontSize: 12, margin: 0 }}>
                  Inicia una de tus plantillas o importa capturas de Symmetry con OCR.
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                }}
              >
                {sortedSessions.slice(0, 12).map((s) => {
                  const muscleSet = new Set<string>();
                  for (const st of s.sets) {
                    const ex = exercises.find((e) => e.id === st.exerciseId) || findSymmetryExercise(st.exerciseId);
                    if (ex?.primaryMuscle) {
                      muscleSet.add(ex.primaryMuscle);
                    }
                  }

                  const targetMuscles =
                    muscleSet.size > 0
                      ? Array.from(muscleSet)
                      : s.templateName?.toLowerCase().includes('empuje')
                      ? ['chest', 'shoulders', 'triceps']
                      : s.templateName?.toLowerCase().includes('pierna')
                      ? ['quads', 'hamstrings', 'glutes', 'calves']
                      : ['back', 'lats', 'biceps'];

                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSessionDetail(s)}
                      style={{
                        position: 'relative',
                        aspectRatio: '1 / 1.55',
                        borderRadius: 12,
                        background: '#0d0e12',
                        border: '1px solid #1c1e24',
                        padding: '10px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        transition: 'border-color 0.2s ease, transform 0.15s ease',
                      }}
                    >
                      {/* Top Date */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff' }}>
                          {formatSessionDate(s.date)}
                        </span>
                        {s.date && prDates.has(s.date) ? (
                          <span title="Récord personal" style={{ display: 'flex' }}>
                            <SymmetryIcon name="icon_pr_row_trophy" mode="original" size={14} title="Récord personal" />
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: '#6b7280' }}>›</span>
                        )}
                      </div>

                      {/* Center Mannequin Silhouette with Cyan Muscles */}
                      <div style={{ height: '68%', width: '100%', margin: 'auto 0' }}>
                        <SymmetryBodySilhouette
                          highlightedMuscles={targetMuscles}
                          highlightColor="#38bdf8"
                          view="auto"
                          height="100%"
                        />
                      </div>

                      {/* Bottom Duration & Sets */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#ffffff' }}>
                          {formatSessionDuration(s.durationMin)}
                        </span>
                        <span style={{ fontSize: 10, color: '#9ca3af' }}>
                          {s.sets.length} ser.
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ========================================================== */}
          {/* 3. PLANTILLAS PREDETERMINADAS DE SYMMETRY (Plegadas aparte) */}
          {/* ========================================================== */}
          <section style={{ marginTop: 24, borderTop: '1px solid #1a1c22', paddingTop: 16 }}>
            <button
              type="button"
              onClick={() => setShowSymmetryWorkouts(!showSymmetryWorkouts)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 14,
                background: '#121317',
                border: '1px solid #1e2027',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>⚡</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>
                    Entrenamientos Predeterminados de Symmetry
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    {allQuickRoutines.length} rutinas de la app Symmetry
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 700 }}>
                {showSymmetryWorkouts ? '▲ Ocultar' : '▼ Explorar'}
              </span>
            </button>

            {showSymmetryWorkouts && (
              <div style={{ marginTop: 14 }}>
                {/* Muscle Scroller */}
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
                  {[
                    { key: 'all', label: 'Todos' },
                    { key: 'arms', label: 'Brazos' },
                    { key: 'chest', label: 'Pecho' },
                    { key: 'back', label: 'Espalda' },
                    { key: 'legs', label: 'Piernas' },
                    { key: 'shoulders', label: 'Hombros' },
                    { key: 'glutes', label: 'Glúteos' },
                  ].map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setRoutineMuscle(m.key)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 20,
                        background: routineMuscle === m.key ? '#2563eb' : '#14151a',
                        border: routineMuscle === m.key ? 'none' : '1px solid #22252e',
                        color: '#ffffff',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Quick Workouts List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filteredQuickRoutines.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => handleStartQuickWorkout(r)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: 10,
                        borderRadius: 14,
                        background: '#121317',
                        border: '1px solid #1e2027',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          position: 'relative',
                          width: 60,
                          height: 60,
                          borderRadius: 10,
                          overflow: 'hidden',
                          background: '#1a1c22',
                          flexShrink: 0,
                        }}
                      >
                        <SymmetryExerciseVisual
                          exercise={{
                            id: r.exercises[0]?.exerciseTemplateId,
                            name: r.exercises[0]?.name || r.name,
                          }}
                          variant="thumbnail"
                          size={60}
                        />
                        <img
                          src={r.thumbnailUrl}
                          alt={r.name}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 2,
                            left: 2,
                            fontSize: 9,
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: 'rgba(0,0,0,0.7)',
                            color: '#ffffff',
                          }}
                        >
                          ⏱ {r.durationMinutes}m
                        </div>
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#ffffff', marginBottom: 2 }}>
                          {r.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>
                          {MUSCLE_GROUP_LABELS[r.muscleGroupId] || r.muscleGroupId} · {r.exercises.length} ejercicios
                        </div>
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background:
                              r.level === 'beginner'
                                ? 'rgba(34, 197, 94, 0.2)'
                                : r.level === 'advanced'
                                ? 'rgba(239, 68, 68, 0.2)'
                                : 'rgba(245, 158, 11, 0.2)',
                            color:
                              r.level === 'beginner'
                                ? '#4ade80'
                                : r.level === 'advanced'
                                ? '#f87171'
                                : '#fbbf24',
                          }}
                        >
                          {r.level === 'beginner'
                            ? 'Principiante'
                            : r.level === 'advanced'
                            ? 'Avanzado'
                            : 'Intermedio'}
                        </span>
                      </div>

                      <div style={{ color: '#38bdf8', fontSize: 18, paddingRight: 4 }}>›</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: BIBLIOTECA (Templates & Routine Creator) */}
      {/* ============================================================== */}
      {navTab === 'library' && (
        <SymmetryBibliotecaView onStartRoutine={handleStartRoutine} onSelectExercise={openSymmetryExercise} />
      )}

      {/* ============================================================== */}
      {/* TAB 5: PERFIL (3-Col Mannequin Grid & Stats / Constancia) */}
      {/* ============================================================== */}
      {navTab === 'profile' && (
        <div>
          {/* Header @handle + Settings icon */}
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              padding: '0 4px',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff' }}>
              @dvjtrkdsuq0
            </div>

            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                background: connected ? 'rgba(16, 185, 129, 0.15)' : '#16181e',
                border: `1px solid ${connected ? '#10b981' : '#282b36'}`,
                color: connected ? '#10b981' : '#9ca3af',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {connected ? 'Symmetry conectado' : 'Symmetry sin conectar'}
            </button>
          </header>

          {/* Streak + totals */}
          {(() => {
            const totalVolume = gymSessions.reduce(
              (sum, s) => sum + s.sets.reduce((a, x) => (x.skipped || x.weightKg <= 0 ? a : a + x.weightKg * x.reps), 0),
              0,
            );
            const thisWeek = volumeSeries[volumeSeries.length - 1];
            const weekSets = gymSessions
              .filter((s) => s.date && thisWeek && s.date >= thisWeek.week && s.date <= today)
              .reduce((n, s) => n + s.sets.filter((x) => !x.skipped).length, 0);
            return (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr 1fr',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 18,
                  background: '#121317',
                  border: '1px solid #1f2127',
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <SymmetryLottie
                    src={LOTTIE.streakFlame}
                    size={44}
                    fallback={<SymmetryIcon name={streakWeeks > 0 ? 'streak/flame_lit' : 'streak/flame_grey'} mode="original" size={30} />}
                  />
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#f97316', lineHeight: 1 }}>{streakWeeks}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>{streakWeeks === 1 ? 'semana' : 'semanas'}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>Volumen total</div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{compactKg(totalVolume)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>Series esta semana</div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{weekSets}</div>
                </div>
              </div>
            );
          })()}

          <SymmetryBodyScanCard />

          {/* Sub-tabs: 🏋️ Entrenos | 📈 Estadísticas (Screenshot 1 & 3) */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #1f2127',
              marginBottom: 16,
            }}
          >
            <button
              type="button"
              onClick={() => setProfileSubTab('workouts')}
              style={{
                flex: 1,
                padding: '10px 0',
                background: 'none',
                border: 'none',
                color: profileSubTab === 'workouts' ? '#ffffff' : '#6b7280',
                fontSize: 20,
                cursor: 'pointer',
                borderBottom: profileSubTab === 'workouts' ? '2px solid #ffffff' : '2px solid transparent',
              }}
              title="Entrenamientos pasados"
            >
              🏋️
            </button>

            <button
              type="button"
              onClick={() => setProfileSubTab('stats')}
              style={{
                flex: 1,
                padding: '10px 0',
                background: 'none',
                border: 'none',
                color: profileSubTab === 'stats' ? '#ffffff' : '#6b7280',
                fontSize: 20,
                cursor: 'pointer',
                borderBottom: profileSubTab === 'stats' ? '2px solid #ffffff' : '2px solid transparent',
              }}
              title="Estadísticas y PRs"
            >
              📈
            </button>
          </div>

          {/* SUBTAB 1: 3-COLUMN MANNEQUIN GRID (Screenshot 3) */}
          {profileSubTab === 'workouts' && (
            <div>
              {sortedSessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
                  No tienes sesiones registradas aún.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                  }}
                >
                  {sortedSessions.map((s) => {
                    // Detect trained muscles from session sets
                    const muscleSet = new Set<string>();
                    for (const st of s.sets) {
                      const ex = exercises.find((e) => e.id === st.exerciseId) || findSymmetryExercise(st.exerciseId);
                      if (ex?.primaryMuscle) {
                        muscleSet.add(ex.primaryMuscle);
                      }
                    }

                    // Fallback to push or pull focus if empty sets
                    const targetMuscles =
                      muscleSet.size > 0
                        ? Array.from(muscleSet)
                        : s.templateName?.toLowerCase().includes('empuje')
                        ? ['chest', 'shoulders', 'triceps']
                        : ['back', 'lats', 'biceps'];

                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelectedSessionDetail(s)}
                        style={{
                          position: 'relative',
                          aspectRatio: '1 / 1.55',
                          borderRadius: 12,
                          background: '#0d0e12',
                          border: '1px solid #1c1e24',
                          padding: '10px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Top-left Date */}
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#ffffff' }}>
                          {formatSessionDate(s.date)}
                        </div>

                        {/* Center Mannequin Silhouette with Cyan Muscles */}
                        <div style={{ height: '70%', width: '100%', margin: 'auto 0' }}>
                          <SymmetryBodySilhouette
                            highlightedMuscles={targetMuscles}
                            highlightColor="#38bdf8"
                            view="auto"
                            height="100%"
                          />
                        </div>

                        {/* Bottom-left Duration */}
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#ffffff' }}>
                          {formatSessionDuration(s.durationMin)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 2: STATS / PRS / CONSTANCIA (Screenshots 1 & 5) */}
          {profileSubTab === 'stats' && (
            <div>
              {/* Weekly volume (last 8 weeks) */}
              {(() => {
                const current = volumeSeries[volumeSeries.length - 1]!;
                const previous = volumeSeries[volumeSeries.length - 2]!;
                const delta = deltaLabel(current.volumeKg, previous.volumeKg);
                const max = Math.max(1, ...volumeSeries.map((w) => w.volumeKg));
                const pts = volumeSeries.map((w, i) => {
                  const x = (i / Math.max(1, volumeSeries.length - 1)) * 290 + 5;
                  const y = 92 - (w.volumeKg / max) * 80;
                  return { x, y };
                });
                const last = pts[pts.length - 1]!;
                return (
                  <div
                    style={{
                      borderRadius: 18,
                      background: '#121317',
                      border: '1px solid #1f2127',
                      padding: '18px 16px',
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>Volumen esta semana</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>Últimas 8 semanas</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
                      <span style={{ fontSize: 24, fontWeight: 900, color: '#ffffff' }}>{compactKg(current.volumeKg)}</span>
                      {delta && (
                        <span style={{ fontSize: 12, color: delta.up ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                          {delta.text} {delta.up ? '↑' : '↓'} vs semana anterior
                        </span>
                      )}
                    </div>

                    <div style={{ height: 110, width: '100%' }}>
                      <svg viewBox="0 0 300 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }} role="img" aria-label="Volumen semanal">
                        <polyline
                          points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                          fill="none"
                          stroke="#2563eb"
                          strokeWidth="3"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                        <circle cx={last.x} cy={last.y} r="4" fill="#38bdf8" />
                      </svg>
                    </div>
                  </div>
                );
              })()}

              {/* Sessions and PRs, last 30 days vs the previous 30 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[
                  { icon: 'icon_pr_summary_dumbbell', value: sessionsLast30, prev: sessionsPrev30, label: sessionsLast30 === 1 ? 'Entreno' : 'Entrenos' },
                  { icon: 'icon_pr_summary_trophy', value: prsLast30, prev: prsPrev30, label: prsLast30 === 1 ? 'Nuevo PR' : 'Nuevos PRs' },
                ].map((c) => {
                  const diff = c.value - c.prev;
                  return (
                    <div key={c.icon} style={{ padding: 14, borderRadius: 14, background: '#121317', border: '1px solid #1f2127' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, marginBottom: 4, color: diff >= 0 ? '#38bdf8' : '#f87171' }}>
                        <SymmetryIcon name={c.icon} mode="original" size={16} />
                        {diff >= 0 ? `↑ +${diff}` : `↓ ${diff}`}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#ffffff' }}>
                        {c.value} {c.label}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Últimos 30 días</div>
                    </div>
                  );
                })}
              </div>

              {/* Recent PRs */}
              <section style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#ffffff', margin: '0 0 12px' }}>PRs recientes</h3>

                {prs.length === 0 ? (
                  <div style={{ padding: 16, borderRadius: 14, background: '#121317', border: '1px solid #1e2027', fontSize: 12, color: '#9ca3af' }}>
                    Aún no hay récords: aparecen cuando superas el 1RM estimado de una sesión anterior.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {prs.slice(0, 5).map((pr) => {
                      const name = exerciseName(pr.exerciseId);
                      const isNew = pr.date >= addDays(today, -6);
                      return (
                        <div
                          key={`${pr.exerciseId}-${pr.date}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '10px 12px',
                            borderRadius: 14,
                            background: '#121317',
                            border: '1px solid #1e2027',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                            <SymmetryExerciseVisual exercise={{ name }} variant="circular" size={44} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', lineHeight: 1.3 }}>{name}</div>
                              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                                {pr.weightKg} kg × {pr.reps} · 1RM {Math.round(pr.e1rm * 10) / 10} kg (+
                                {Math.round((pr.e1rm - pr.previousE1rm) * 10) / 10}) ·{' '}
                                {new Date(`${pr.date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                              </div>
                            </div>
                          </div>

                          {isNew && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: '3px 8px',
                                borderRadius: 12,
                                background: '#2563eb',
                                color: '#ffffff',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              ★ NUEVO
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Consistency heatmap: one column per week, Monday on top */}
              <section
                style={{
                  padding: 16,
                  borderRadius: 18,
                  background: '#121317',
                  border: '1px solid #1f2127',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <h4 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 2px' }}>Constancia</h4>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                      {heatmap.size}/{HEATMAP_DAYS} días · {(heatmap.size / (HEATMAP_DAYS / 7)).toLocaleString('es-ES', { maximumFractionDigits: 1 })}x/semana
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>12 semanas</span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateRows: 'repeat(7, 1fr)',
                    gridAutoFlow: 'column',
                    gridAutoColumns: '1fr',
                    gap: 4,
                    margin: '14px 0',
                  }}
                >
                  {(() => {
                    // Start on the Monday 11 weeks before this week's Monday, end on Sunday of this week.
                    const thisMonday = addDays(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7));
                    const start = addDays(thisMonday, -7 * (HEATMAP_DAYS / 7 - 1));
                    return Array.from({ length: HEATMAP_DAYS }).map((_, idx) => {
                      const d = addDays(start, idx);
                      const trained = heatmap.has(d);
                      const future = d > today;
                      return (
                        <div
                          key={d}
                          title={d}
                          style={{
                            aspectRatio: '1 / 1',
                            borderRadius: 4,
                            background: trained ? '#38bdf8' : future ? 'transparent' : '#1c1e25',
                          }}
                        />
                      );
                    });
                  })()}
                </div>

                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#9ca3af' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#38bdf8' }} />
                    Entrenó
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#1c1e25' }} />
                    Descanso
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* AUTHENTIC SYMMETRY BOTTOM NAVIGATION BAR (Screenshots 1 - 6)   */}
      {/* ============================================================== */}
      <nav
        aria-label="Secciones del gimnasio"
        style={{
          position: 'fixed',
          // Sits right above the app tab bar (fixed at the bottom, ~62px plus the safe area).
          bottom: 'calc(62px + env(safe-area-inset-bottom, 0px))',
          left: 0,
          right: 0,
          maxWidth: 480,
          margin: '0 auto',
          height: 56,
          background: '#0a0b0e',
          borderTop: '1px solid #1b1d24',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 50,
          boxSizing: 'border-box',
        }}
      >
        {NAV_ITEMS.map(({ tab, label, icon }) => {
          const active = navTab === tab;
          const activeColor = tab === 'train' ? '#38bdf8' : '#ffffff';
          return (
            <button
              key={tab}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setNavTab(tab)}
              style={{
                flex: 1,
                height: '100%',
                background: 'none',
                border: 'none',
                color: active ? activeColor : '#6b7280',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: active ? 700 : 500,
              }}
            >
              <SymmetryIcon name={icon} size={tab === 'train' ? 24 : 22} color={active ? activeColor : '#6b7280'} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* ============================================================== */}
      {/* MODAL: DETALLE DE SESIÓN PASADA */}
      {/* ============================================================== */}
      {selectedSessionDetail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
          onClick={() => setSelectedSessionDetail(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#121317',
              borderTop: '1px solid #282b36',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: '20px 18px 36px',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxSizing: 'border-box',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: '#38bdf8',
                    letterSpacing: 0.5,
                  }}
                >
                  Entrenamiento Completado
                </span>
                <h2 style={{ fontSize: 20, fontWeight: 900, margin: '2px 0 4px', color: '#ffffff' }}>
                  {selectedSessionDetail.templateName || 'Sesión de Gimnasio'}
                </h2>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>
                  📅 {selectedSessionDetail.date || 'Fecha'} · ⏱ {formatSessionDuration(selectedSessionDetail.durationMin)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSessionDetail(null)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: '#1f2127',
                  border: 'none',
                  color: '#9ca3af',
                  fontSize: 16,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            {/* Quick Stats Grid */}
            {(() => {
              const totalKg = selectedSessionDetail.sets.reduce((sum, s) => {
                if (s.skipped) return sum;
                return sum + (s.weightKg || 0) * (s.reps || 0);
              }, 0);

              const completedSetsCount = selectedSessionDetail.sets.filter((s) => !s.skipped).length;

              const muscleSet = new Set<string>();
              for (const st of selectedSessionDetail.sets) {
                const ex = exercises.find((e) => e.id === st.exerciseId) || findSymmetryExercise(st.exerciseId);
                if (ex?.primaryMuscle) {
                  muscleSet.add(ex.primaryMuscle);
                }
              }
              const targetMuscles =
                muscleSet.size > 0
                  ? Array.from(muscleSet)
                  : ['chest', 'back', 'biceps'];

              return (
                <div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ background: '#181a20', padding: 12, borderRadius: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Volumen</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#ffffff', marginTop: 2 }}>
                        {totalKg > 0 ? `${Math.round(totalKg).toLocaleString()} kg` : '—'}
                      </div>
                    </div>
                    <div style={{ background: '#181a20', padding: 12, borderRadius: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Series</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#ffffff', marginTop: 2 }}>
                        {completedSetsCount}
                      </div>
                    </div>
                    <div style={{ background: '#181a20', padding: 12, borderRadius: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Duración</div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#ffffff', marginTop: 2 }}>
                        {formatSessionDuration(selectedSessionDetail.durationMin)}
                      </div>
                    </div>
                  </div>

                  {/* Body Silhouette preview */}
                  <div
                    style={{
                      background: '#0d0e12',
                      border: '1px solid #1c1e24',
                      borderRadius: 16,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      marginBottom: 18,
                    }}
                  >
                    <div style={{ width: 64, height: 90, flexShrink: 0 }}>
                      <SymmetryBodySilhouette
                        highlightedMuscles={targetMuscles}
                        highlightColor="#38bdf8"
                        view="auto"
                        height="100%"
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>
                        Músculos Estimulados
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, lineHeight: 1.4 }}>
                        {targetMuscles.join(', ')}
                      </div>
                    </div>
                  </div>

                  {/* Exercises and sets breakdown */}
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: '#ffffff', margin: '0 0 10px' }}>
                      Ejercicios Realizados
                    </h3>

                    {(() => {
                      // Group by exerciseId
                      const exGroups = new Map<string, typeof selectedSessionDetail.sets>();
                      for (const s of selectedSessionDetail.sets) {
                        const list = exGroups.get(s.exerciseId) || [];
                        list.push(s);
                        exGroups.set(s.exerciseId, list);
                      }

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {Array.from(exGroups.entries()).map(([exId, setList]) => {
                            const symEx = findSymmetryExercise(exId);
                            const fitplanEx = exercises.find((e) => e.id === exId);
                            const name = fitplanEx?.name || symEx?.name || exId;

                            return (
                              <div
                                key={exId}
                                style={{
                                  background: '#16181e',
                                  border: '1px solid #22252e',
                                  borderRadius: 12,
                                  padding: 12,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                  <SymmetryExerciseVisual
                                    exercise={symEx || { id: exId, name }}
                                    size={36}
                                  />
                                  <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>
                                    {name}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {setList.map((st, sIdx) => (
                                    <span
                                      key={st.order ?? sIdx}
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: '4px 8px',
                                        borderRadius: 6,
                                        background: st.skipped ? '#261b1b' : '#1f242e',
                                        color: st.skipped ? '#ef4444' : '#38bdf8',
                                        border: `1px solid ${st.skipped ? 'rgba(239,68,68,0.2)' : 'rgba(56,189,248,0.2)'}`,
                                      }}
                                    >
                                      {st.skipped
                                        ? `S${sIdx + 1}: Saltada`
                                        : `${st.weightKg}kg × ${st.reps}`}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleRepeatSession(selectedSessionDetail)}
                      style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: 14,
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: 15,
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                      }}
                    >
                      <span>▶</span> Repetir este entrenamiento
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const s = selectedSessionDetail;
                        setSelectedSessionDetail(null);
                        setView({ kind: 'live', session: s });
                      }}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: 14,
                        background: '#181a20',
                        color: '#9ca3af',
                        border: '1px solid #282b36',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      ✏️ Editar datos del registro
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Login Modal */}
      {showLoginModal && (
        <SymmetryLoginModal onClose={() => setShowLoginModal(false)} />
      )}

      {/* Exercise Picker Modal */}
      {showExercisePicker && (
        <SymmetryExercisePicker
          onClose={() => setShowExercisePicker(false)}
          onSelect={(ex) => setView({ kind: 'live', templateName: ex.name, exercises: [ex] })}
        />
      )}
    </div>
  );
}
