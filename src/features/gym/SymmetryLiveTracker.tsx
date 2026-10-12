import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppData } from '../../app/AppData';
import { dateKey } from '../../domain/dates';
import type { GymSession, SetEntry, Exercise } from '../../data/db/models';
import { saveGymSessions, saveExercises } from '../../data/db/repository';
import {
  findSymmetryExercise,
  calculateSymmetryRank,
  type SymmetryExercise,
  type CalculatedRank,
} from '../../data/symmetry/symmetryCatalog';
import { isSymmetryConnected, pushWorkoutToSymmetry } from '../../data/symmetry/symmetryApi';
import { lastSetFor } from './gymStats';
import { SymmetryExercisePicker } from './SymmetryExercisePicker';
import { SymmetryExerciseVisual } from './SymmetryExerciseVisual';
import { assetUrl } from '../../data/symmetry/assetHelper';

interface TrackerSet {
  id: string;
  weightKg: string;
  reps: string;
  rir: string;
  completed: boolean;
}

interface TrackerExercise {
  uid: string;
  exerciseId: string; // ID in FitPlan DB
  symmetryId?: number; // 1..155 if mapped to Symmetry
  name: string;
  implement: string;
  category: 'push' | 'pull' | 'legs';
  primaryMuscle: string;
  loadDivisor: number;
  sets: TrackerSet[];
}

function playTimerChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // AudioContext might be restricted until user interaction
  }
}

function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}:${String(remM).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface SymmetryTrackerInitialExercise extends SymmetryExercise {
  targetSets?: number;
  targetReps?: number;
}

export function SymmetryLiveTracker({
  initialTemplateName = 'Entrenamiento',
  initialExercises = [],
  existingSession,
  onDone,
}: {
  initialTemplateName?: string;
  initialExercises?: SymmetryTrackerInitialExercise[];
  existingSession?: GymSession;
  onDone: () => void;
}) {
  const { db, exercises, gymSessions, bestSets, profile, days, timeZone, reload } = useAppData();

  const [sessionName, setSessionName] = useState(
    existingSession?.templateName || initialTemplateName,
  );
  const [startTime] = useState<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(
    existingSession?.durationMin ? existingSession.durationMin * 60 : 0,
  );
  const [activeExerciseIndex, setActiveExerciseIndex] = useState<number>(0);
  const [showPicker, setShowPicker] = useState(false);
  const [restSecondsLeft, setRestSecondsLeft] = useState<number | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // User body weight for 1RM ranking
  const userWeightKg = useMemo(() => {
    if (profile?.startWeightKg && profile.startWeightKg > 0) return profile.startWeightKg;
    const lastDayWeight = days.find((d) => d.bodyMassKg && d.bodyMassKg > 0)?.bodyMassKg;
    return lastDayWeight && lastDayWeight > 0 ? lastDayWeight : 75;
  }, [profile, days]);

  // Convert existing session sets to TrackerExercise list
  const [workoutExercises, setWorkoutExercises] = useState<TrackerExercise[]>(() => {
    if (existingSession && existingSession.sets.length > 0) {
      const grouped: TrackerExercise[] = [];
      for (const set of [...existingSession.sets].sort((a, b) => a.order - b.order)) {
        let current = grouped[grouped.length - 1];
        if (!current || current.exerciseId !== set.exerciseId) {
          const exObj = exercises.find((e) => e.id === set.exerciseId);
          const symEx = findSymmetryExercise(exObj?.name ?? set.exerciseId);
          current = {
            uid: `ex-${Date.now()}-${Math.random()}`,
            exerciseId: set.exerciseId,
            symmetryId: symEx?.id,
            name: exObj?.name ?? symEx?.name ?? set.exerciseId,
            implement: symEx?.implement ?? exObj?.equipment ?? 'barbell',
            category: exObj?.category ?? symEx?.category ?? 'push',
            primaryMuscle: exObj?.primaryMuscle ?? symEx?.primaryMuscle ?? 'chest',
            loadDivisor: symEx?.loadDivisor ?? (exObj?.loadMode === 'perDumbbell' ? 2 : 1),
            sets: [],
          };
          grouped.push(current);
        }
        current.sets.push({
          id: `set-${Date.now()}-${Math.random()}`,
          weightKg: String(set.weightKg),
          reps: String(set.reps),
          rir: set.rir !== undefined ? String(set.rir) : '',
          completed: !set.skipped,
        });
      }
      return grouped;
    }

    if (initialExercises.length > 0) {
      return initialExercises.map((symEx, exIdx) => {
        const matchingEx = exercises.find(
          (e) => e.name.toLowerCase() === symEx.name.toLowerCase() || e.id === String(symEx.id),
        );
        const exId = matchingEx ? matchingEx.id : `sym-${symEx.id}`;
        const numSets = symEx.targetSets && symEx.targetSets > 0 ? symEx.targetSets : 3;
        const targetReps = symEx.targetReps && symEx.targetReps > 0 ? String(symEx.targetReps) : '';

        return {
          uid: `ex-${Date.now()}-${exIdx}-${Math.random()}`,
          exerciseId: exId,
          symmetryId: symEx.id,
          name: symEx.name,
          implement: symEx.implement,
          category: symEx.category,
          primaryMuscle: symEx.primaryMuscle,
          loadDivisor: symEx.loadDivisor,
          sets: Array.from({ length: numSets }, (_, sIdx) => ({
            id: `set-init-${exIdx}-${sIdx}`,
            weightKg: '',
            reps: targetReps,
            rir: '',
            completed: false,
          })),
        };
      });
    }

    return [];
  });

  // Workout timer interval
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Rest timer interval
  const chimePlayedRef = useRef(false);
  useEffect(() => {
    if (restSecondsLeft === null) {
      chimePlayedRef.current = false;
      return;
    }
    if (restSecondsLeft <= 0) {
      if (!chimePlayedRef.current) {
        chimePlayedRef.current = true;
        playTimerChime();
      }
      const timeout = setTimeout(() => {
        setRestSecondsLeft(null);
      }, 2500);
      return () => clearTimeout(timeout);
    }

    const t = setInterval(() => {
      setRestSecondsLeft((s) => (s !== null && s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [restSecondsLeft]);

  // Set toggle & rest trigger
  function toggleSetCompleted(exerciseIndex: number, setIndex: number) {
    setWorkoutExercises((prev) => {
      const copy = [...prev];
      const targetEx = copy[exerciseIndex];
      if (!targetEx) return prev;
      const targetSet = targetEx.sets[setIndex];
      if (!targetSet) return prev;

      const nextCompleted = !targetSet.completed;
      const updatedSets = [...targetEx.sets];
      updatedSets[setIndex] = { ...targetSet, completed: nextCompleted };
      copy[exerciseIndex] = { ...targetEx, sets: updatedSets };

      if (nextCompleted) {
        // Start rest timer (90s)
        setRestSecondsLeft(90);
      }
      return copy;
    });
  }

  // Update set values
  function updateSetValue(
    exerciseIndex: number,
    setIndex: number,
    field: 'weightKg' | 'reps' | 'rir',
    val: string,
  ) {
    setWorkoutExercises((prev) => {
      const copy = [...prev];
      const targetEx = copy[exerciseIndex];
      if (!targetEx) return prev;
      const targetSet = targetEx.sets[setIndex];
      if (!targetSet) return prev;

      const updatedSets = [...targetEx.sets];
      updatedSets[setIndex] = { ...targetSet, [field]: val };
      copy[exerciseIndex] = { ...targetEx, sets: updatedSets };
      return copy;
    });
  }

  // Add set to exercise
  function addSet(exerciseIndex: number) {
    setWorkoutExercises((prev) => {
      const copy = [...prev];
      const targetEx = copy[exerciseIndex];
      if (!targetEx) return prev;
      const lastSet = targetEx.sets[targetEx.sets.length - 1];
      const newSet: TrackerSet = {
        id: `set-${Date.now()}-${Math.random()}`,
        weightKg: lastSet?.weightKg ?? '',
        reps: lastSet?.reps ?? '',
        rir: lastSet?.rir ?? '',
        completed: false,
      };
      copy[exerciseIndex] = { ...targetEx, sets: [...targetEx.sets, newSet] };
      return copy;
    });
  }

  // Delete set
  function deleteSet(exerciseIndex: number, setIndex: number) {
    setWorkoutExercises((prev) => {
      const copy = [...prev];
      const targetEx = copy[exerciseIndex];
      if (!targetEx) return prev;
      const updatedSets = targetEx.sets.filter((_, idx) => idx !== setIndex);
      copy[exerciseIndex] = { ...targetEx, sets: updatedSets };
      return copy;
    });
  }

  // Delete exercise
  function deleteExercise(exerciseIndex: number) {
    setWorkoutExercises((prev) => prev.filter((_, idx) => idx !== exerciseIndex));
  }

  // Add exercise from Symmetry picker
  async function handleSelectExercise(symEx: SymmetryExercise) {
    let matchingEx = exercises.find(
      (e) => e.name.toLowerCase() === symEx.name.toLowerCase() || e.id === String(symEx.id),
    );

    if (!matchingEx) {
      // Auto register into FitPlan exercises table
      const newEx: Exercise = {
        id: `sym-${symEx.id}`,
        name: symEx.name,
        aliases: [symEx.name],
        primaryMuscle: symEx.primaryMuscle,
        secondaryMuscles: [],
        equipment: (symEx.implement as Exercise['equipment']) ?? 'barbell',
        loadMode: symEx.loadDivisor === 2 ? 'perDumbbell' : 'total',
        category: symEx.category,
      };
      await saveExercises(db, [newEx]);
      matchingEx = newEx;
    }

    const exId = matchingEx.id;
    const last = lastSetFor(exId, gymSessions, bestSets);

    const newTrackedEx: TrackerExercise = {
      uid: `ex-${Date.now()}-${Math.random()}`,
      exerciseId: exId,
      symmetryId: symEx.id,
      name: symEx.name,
      implement: symEx.implement,
      category: symEx.category,
      primaryMuscle: symEx.primaryMuscle,
      loadDivisor: symEx.loadDivisor,
      sets: [
        {
          id: `set-${Date.now()}-1`,
          weightKg: last ? String(last.weightKg) : '',
          reps: last ? String(last.reps) : '',
          rir: '',
          completed: false,
        },
        {
          id: `set-${Date.now()}-2`,
          weightKg: last ? String(last.weightKg) : '',
          reps: last ? String(last.reps) : '',
          rir: '',
          completed: false,
        },
        {
          id: `set-${Date.now()}-3`,
          weightKg: last ? String(last.weightKg) : '',
          reps: last ? String(last.reps) : '',
          rir: '',
          completed: false,
        },
      ],
    };

    setWorkoutExercises((prev) => [...prev, newTrackedEx]);
  }

  // Finish session
  async function handleFinishSession() {
    setIsFinishing(true);
    setStatusMessage(null);

    const validSets: SetEntry[] = [];
    for (const ex of workoutExercises) {
      for (const s of ex.sets) {
        const w = Number(s.weightKg.replace(',', '.'));
        const r = Number(s.reps.replace(',', '.'));
        if (s.weightKg === '' && s.reps === '') continue;
        if (!Number.isFinite(w) || !Number.isFinite(r) || w < 0 || r < 0) continue;
        const rirVal = s.rir.trim() !== '' ? Number(s.rir.replace(',', '.')) : undefined;

        validSets.push({
          exerciseId: ex.exerciseId,
          order: validSets.length,
          weightKg: w,
          reps: Math.round(r),
          rir: Number.isFinite(rirVal) ? rirVal : undefined,
          skipped: !s.completed,
        });
      }
    }

    if (validSets.length === 0) {
      alert('Añade o completa al menos una serie para guardar la sesión.');
      setIsFinishing(false);
      return;
    }

    const sessionDate = existingSession?.date ?? dateKey(startTime, timeZone);
    const durationMin = Math.max(1, Math.round(elapsedSeconds / 60));

    const sessionToSave: GymSession = {
      id: existingSession?.id ?? `app-${Date.now()}`,
      date: sessionDate,
      templateName: sessionName.trim() || 'Entrenamiento Symmetry',
      source: 'symmetry',
      durationMin,
      sets: validSets,
      summaryOnly: false,
      needsReview: false,
      createdAt: existingSession?.createdAt ?? Date.now(),
    };

    try {
      await saveGymSessions(db, [sessionToSave]);

      // If connected to Symmetry, upload directly!
      if (isSymmetryConnected()) {
        setStatusMessage('Subiendo entrenamiento a los servidores de Symmetry...');
        const syncRes = await pushWorkoutToSymmetry(sessionToSave);
        if (syncRes.ok) {
          setStatusMessage('¡Sincronizado con éxito con Symmetry!');
        } else {
          console.warn('Symmetry upload warning:', syncRes.error);
        }
      }

      await reload();
      onDone();
    } catch (err) {
      alert(`Error al guardar sesión: ${(err as Error).message}`);
      setIsFinishing(false);
    }
  }

  return (
    <div className="symmetry-container sym-live-tracker">
      {/* Sticky top header with elapsed timer and Finish button */}
      {/* Sticky top header matching Screenshots 8 & 9 */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 4px',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            type="button"
            onClick={() => {
              if (workoutExercises.some((e) => e.sets.some((s) => s.completed))) {
                if (!confirm('¿Deseas salir del entrenamiento en curso?')) return;
              }
              onDone();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              fontSize: 22,
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            ∨
          </button>

          <div style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', letterSpacing: 0.5 }}>
            {formatTimer(elapsedSeconds)}
          </div>

          <span style={{ fontSize: 16, color: '#9ca3af', cursor: 'pointer' }}>⏱️</span>
          <span style={{ fontSize: 16, color: '#9ca3af', cursor: 'pointer' }}>⚙️</span>
        </div>

        <button
          type="button"
          onClick={handleFinishSession}
          disabled={isFinishing}
          style={{
            padding: '8px 18px',
            borderRadius: 14,
            background: '#16181e',
            border: '1px solid #292d38',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {isFinishing ? 'Guardando...' : 'Terminar'}
        </button>
      </header>

      {/* Routine Title */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={sessionName}
          onChange={(e) => setSessionName(e.target.value)}
          className="sym-search-input"
          style={{
            fontSize: 18,
            fontWeight: 800,
            padding: '10px 14px',
            marginBottom: 4,
            borderColor: 'rgba(255, 255, 255, 0.15)',
          }}
          placeholder="Nombre del entrenamiento"
        />
        <div style={{ color: 'var(--sym-text-muted)', fontSize: 12, paddingLeft: 4 }}>
          {workoutExercises.length} ejercicios · {workoutExercises.reduce((acc, e) => acc + e.sets.length, 0)} series
        </div>
      </div>

      {statusMessage && (
        <div className="sym-alert-box info" style={{ marginBottom: 16 }}>
          {statusMessage}
        </div>
      )}

      {/* Exercise Circular Carousel (Screenshots 8 & 9) */}
      {workoutExercises.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            padding: '8px 4px 16px',
            marginBottom: 8,
            alignItems: 'center',
          }}
        >
          {workoutExercises.map((ex, idx) => {
            const isActive = idx === activeExerciseIndex;
            return (
              <SymmetryExerciseVisual
                key={ex.uid}
                exercise={{ id: ex.symmetryId, name: ex.name }}
                variant="circular"
                size={58}
                active={isActive}
                onClick={() => setActiveExerciseIndex(idx)}
              />
            );
          })}
        </div>
      )}

      {/* Main Guided Workout Content */}
      {workoutExercises.length === 0 ? (
        <div
          style={{
            background: 'var(--sym-surface)',
            borderRadius: 16,
            padding: '36px 20px',
            textAlign: 'center',
            border: '1px dashed var(--sym-border)',
            marginBottom: 20,
          }}
        >
          <img
            src={assetUrl('symmetry/icons/dumbell_icon.svg')}
            alt=""
            style={{ width: 44, height: 44, opacity: 0.4, marginBottom: 12, filter: 'invert(1)' }}
          />
          <h3 style={{ color: '#ffffff', margin: '0 0 6px' }}>Tu entrenamiento está vacío</h3>
          <p style={{ color: 'var(--sym-text-muted)', fontSize: 14, margin: '0 0 16px' }}>
            Añade ejercicios oficiales de Symmetry para empezar a registrar tus series y rangos.
          </p>
          <button
            type="button"
            className="sym-btn-primary"
            style={{ margin: '0 auto' }}
            onClick={() => setShowPicker(true)}
          >
            + Añadir Ejercicio
          </button>
        </div>
      ) : (
        (() => {
          const ex = workoutExercises[activeExerciseIndex] ?? workoutExercises[0];
          if (!ex) return null;
          const exIdx = activeExerciseIndex;
          const last = lastSetFor(ex.exerciseId, gymSessions, bestSets);

          let rank: CalculatedRank | null = null;
          if (ex.symmetryId) {
            const topWeight = last ? last.weightKg : 0;
            const topReps = last ? last.reps : 1;
            const oneRepMax = topReps === 1 ? topWeight : topWeight * (1 + topReps / 30);
            rank = calculateSymmetryRank(ex.symmetryId, oneRepMax, userWeightKg, 'male');
          }

          const rankSvg = assetUrl(rank?.svg ?? 'symmetry/icons/ranking/rank=ruby2.svg');
          const rankTierName = rank?.name ?? 'Rubí II';

          return (
            <div key={ex.uid} className="sym-exercise-hero-container">
              {/* Hero 3D Render (Screenshots 8 & 9) */}
              <div style={{ marginBottom: 16 }}>
                <SymmetryExerciseVisual
                  exercise={{ id: ex.symmetryId, name: ex.name }}
                  variant="hero"
                />
              </div>

              {/* Title & Rep Interval */}
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <h2
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: '#ffffff',
                    margin: '0 0 4px',
                    letterSpacing: '-0.3px',
                  }}
                >
                  {ex.name}
                </h2>
                <div style={{ fontSize: 14, color: '#9ca3af', fontWeight: 600 }}>
                  Intervalo 8–10
                </div>
              </div>

              {/* Action Pills Row (Screenshots 8 & 9) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginBottom: 24,
                  flexWrap: 'wrap',
                }}
              >
                {/* Rank Badge Pill */}
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: '#1a1d24',
                    border: '1px solid #282b35',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title={rankTierName}
                >
                  <img src={rankSvg} alt="" style={{ width: 22, height: 22 }} />
                </div>

                {/* Tutorial Pill */}
                <button
                  type="button"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 20,
                    background: '#1c1e25',
                    border: '1px solid #282b35',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <span>▶</span> Tutorial
                </button>

                {/* Reemplazar Pill */}
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 20,
                    background: '#1c1e25',
                    border: '1px solid #282b35',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <span>🔄</span> Reemplazar
                </button>

                {/* Notas Pill */}
                <button
                  type="button"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 20,
                    background: '#1c1e25',
                    border: '1px solid #282b35',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <span>✏️</span> Notas
                </button>
              </div>

              {/* Sets Table (Screenshots 8 & 9) */}
              <div
                style={{
                  background: '#111216',
                  borderRadius: 18,
                  padding: '16px 14px',
                  border: '1px solid #1c1e25',
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '44px 1fr 70px 70px 44px',
                    gap: 8,
                    color: '#9ca3af',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    marginBottom: 12,
                    textAlign: 'center',
                  }}
                >
                  <div>SERIE</div>
                  <div style={{ textAlign: 'left', paddingLeft: 8 }}>PREVIA</div>
                  <div>KG</div>
                  <div>REPES</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: '#2563eb',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                      }}
                    >
                      ✨
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {ex.sets.map((set, setIdx) => {
                    const prevDisplay = last ? `${last.weightKg} × ${last.reps}` : '-';

                    return (
                      <div
                        key={set.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '44px 1fr 70px 70px 44px',
                          gap: 8,
                          alignItems: 'center',
                        }}
                      >
                        {/* Serie Number */}
                        <div
                          style={{
                            height: 38,
                            borderRadius: 10,
                            background: '#1c1e25',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#9ca3af',
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {setIdx + 1}
                        </div>

                        {/* Previa */}
                        <div
                          style={{
                            fontSize: 13,
                            color: '#9ca3af',
                            fontWeight: 600,
                            paddingLeft: 8,
                          }}
                        >
                          {prevDisplay}
                        </div>

                        {/* KG Input Box */}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={set.weightKg}
                          placeholder="0"
                          onChange={(e) =>
                            updateSetValue(exIdx, setIdx, 'weightKg', e.target.value)
                          }
                          style={{
                            height: 38,
                            borderRadius: 10,
                            background: '#242730',
                            border: '1px solid #303440',
                            color: '#ffffff',
                            fontSize: 15,
                            fontWeight: 700,
                            textAlign: 'center',
                            outline: 'none',
                          }}
                        />

                        {/* Repes Input Box */}
                        <input
                          type="text"
                          inputMode="numeric"
                          value={set.reps}
                          placeholder="0"
                          onChange={(e) =>
                            updateSetValue(exIdx, setIdx, 'reps', e.target.value)
                          }
                          style={{
                            height: 38,
                            borderRadius: 10,
                            background: '#242730',
                            border: '1px solid #303440',
                            color: '#ffffff',
                            fontSize: 15,
                            fontWeight: 700,
                            textAlign: 'center',
                            outline: 'none',
                          }}
                        />

                        {/* Circular Checkmark Button */}
                        <button
                          type="button"
                          onClick={() => toggleSetCompleted(exIdx, setIdx)}
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: '50%',
                            background: set.completed ? '#22c55e' : '#262933',
                            border: 'none',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: 16,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          ✓
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Add set & delete actions */}
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => addSet(exIdx)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      background: 'transparent',
                      border: '1px dashed #2d313d',
                      borderRadius: 10,
                      color: '#9ca3af',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    + Añadir Serie
                  </button>
                  {ex.sets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => deleteSet(exIdx, ex.sets.length - 1)}
                      style={{
                        padding: '10px 14px',
                        background: 'transparent',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 10,
                        color: '#f87171',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      title="Eliminar última serie"
                    >
                      − Serie
                    </button>
                  )}
                  {workoutExercises.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        deleteExercise(exIdx);
                        setActiveExerciseIndex((prev) => Math.max(0, prev - 1));
                      }}
                      style={{
                        padding: '10px 14px',
                        background: 'transparent',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 10,
                        color: '#f87171',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      title="Eliminar ejercicio"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>

              {/* Navigation buttons: Next / Previous Exercise */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 30 }}>
                {activeExerciseIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveExerciseIndex(activeExerciseIndex - 1)}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 12,
                      background: '#1a1c22',
                      border: '1px solid #282b35',
                      color: '#ffffff',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ← Ejercicio Anterior
                  </button>
                )}

                {activeExerciseIndex < workoutExercises.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setActiveExerciseIndex(activeExerciseIndex + 1)}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 12,
                      background: '#1a1c22',
                      border: '1px solid #282b35',
                      color: '#ffffff',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Siguiente Ejercicio →
                  </button>
                )}
              </div>
            </div>
          );
        })()
      )}

      {/* Add exercise action */}
      {workoutExercises.length > 0 && (
        <button
          type="button"
          className="sym-btn-secondary"
          style={{ width: '100%', marginBottom: 40 }}
          onClick={() => setShowPicker(true)}
        >
          + Añadir Ejercicio
        </button>
      )}

      {/* Floating Rest Timer Widget */}
      {restSecondsLeft !== null && (
        <div className="sym-rest-floating">
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sym-text-muted)', textTransform: 'uppercase' }}>
              Descanso
            </div>
            <div className="sym-rest-timer-time">
              {formatTimer(restSecondsLeft)}
            </div>
          </div>

          <div className="sym-rest-controls">
            <button
              type="button"
              className="sym-rest-step-btn"
              onClick={() => setRestSecondsLeft((s) => (s !== null ? Math.max(0, s - 15) : 0))}
            >
              -15s
            </button>
            <button
              type="button"
              className="sym-rest-step-btn"
              onClick={() => setRestSecondsLeft((s) => (s !== null ? s + 30 : 30))}
            >
              +30s
            </button>
            <button
              type="button"
              className="sym-rest-step-btn"
              style={{ color: 'var(--sym-red)', fontWeight: 700 }}
              onClick={() => setRestSecondsLeft(null)}
            >
              Saltar
            </button>
          </div>
        </div>
      )}

      {/* Exercise Picker Modal */}
      {showPicker && (
        <SymmetryExercisePicker
          onSelect={handleSelectExercise}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
