import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppData } from '../../app/AppData';
import { dateKey } from '../../domain/dates';
import type { GymSession, SetEntry, Exercise } from '../../data/db/models';
import { saveGymSessions, saveExercises } from '../../data/db/repository';
import {
  findSymmetryExercise,
  calculateSymmetryRank,
  IMPLEMENT_LABELS,
  getMuscleImage,
  getEquipmentImage,
  type SymmetryExercise,
  type CalculatedRank,
} from '../../data/symmetry/symmetryCatalog';
import { isSymmetryConnected, pushWorkoutToSymmetry } from '../../data/symmetry/symmetryApi';
import { lastSetFor } from './gymStats';
import { SymmetryExercisePicker } from './SymmetryExercisePicker';

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
      <header className="sym-live-header">
        <button
          type="button"
          className="sym-btn-secondary"
          style={{ padding: '6px 12px', fontSize: 13 }}
          onClick={() => {
            if (workoutExercises.some((e) => e.sets.some((s) => s.completed))) {
              if (!confirm('¿Deseas descartar los cambios del entrenamiento actual?')) return;
            }
            onDone();
          }}
        >
          ‹ Descartar
        </button>

        <div className="sym-timer-display">
          <span className="sym-timer-pulse" />
          <span className="sym-timer-number">{formatTimer(elapsedSeconds)}</span>
        </div>

        <button
          type="button"
          className="sym-btn-finish"
          onClick={handleFinishSession}
          disabled={isFinishing}
        >
          {isFinishing ? 'Guardando...' : 'Finalizar'}
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

      {/* Exercise Boxes */}
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
            src="/symmetry/icons/dumbell_icon.svg"
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
        workoutExercises.map((ex, exIdx) => {
          // Last performance for this exercise
          const last = lastSetFor(ex.exerciseId, gymSessions, bestSets);

          // Calculate rank
          let rank: CalculatedRank | null = null;
          if (ex.symmetryId) {
            const topWeight = last ? last.weightKg : 0;
            const topReps = last ? last.reps : 1;
            const oneRepMax = topReps === 1 ? topWeight : topWeight * (1 + topReps / 30);
            rank = calculateSymmetryRank(ex.symmetryId, oneRepMax, userWeightKg, 'male');
          }

          const rankSvg = rank?.svg ?? '/symmetry/icons/ranking/rank=iron1.svg';
          const rankTierName = rank?.name ?? 'Hierro I';
          const implementLabel = IMPLEMENT_LABELS[ex.implement] ?? ex.implement;
          const muscleImg = getMuscleImage(ex.primaryMuscle);
          const equipImg = getEquipmentImage(ex.implement);

          // Check if current session sets beat the historical 1RM for a new PR
          const hasNewPR = ex.sets.some((s) => {
            if (!s.completed) return false;
            const w = parseFloat(s.weightKg);
            const r = parseInt(s.reps, 10);
            if (!w || !r || !last || last.weightKg <= 0) return false;
            const current1RM = r === 1 ? w : w * (1 + r / 30);
            const last1RM = last.reps === 1 ? last.weightKg : last.weightKg * (1 + last.reps / 30);
            return current1RM > last1RM;
          });

          return (
            <div key={ex.uid} className="sym-exercise-box">
              <div className="sym-exercise-header">
                <div className="sym-exercise-visual">
                  <img
                    src={muscleImg}
                    alt={ex.primaryMuscle}
                    className="sym-exercise-anatomy-thumb"
                  />
                  <img
                    src={equipImg}
                    alt={ex.implement}
                    className="sym-exercise-equipment-pip"
                  />
                </div>

                <div className="sym-exercise-meta">
                  <h3 className="sym-exercise-name">{ex.name}</h3>
                  <div className="sym-exercise-tags">
                    <span className="sym-tag-pill">{implementLabel}</span>
                    <span className="sym-tag-pill" style={{ color: rank?.color ?? '#9ca3af' }}>
                      {rankTierName}
                    </span>
                    {last && (
                      <span className="sym-overload-chip">
                        <img
                          src="/symmetry/icons/button_overload_blue.svg"
                          alt=""
                          style={{ width: 12, height: 12 }}
                        />
                        Ant: {last.weightKg} kg × {last.reps}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={rankSvg} alt={rankTierName} className="sym-rank-badge-img" />
                  <button
                    type="button"
                    className="sym-modal-close-btn"
                    style={{ fontSize: 16 }}
                    onClick={() => deleteExercise(exIdx)}
                    title="Eliminar ejercicio"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {hasNewPR && (
                <div className="sym-pr-banner">
                  <span style={{ fontSize: 16 }}>🔥</span>
                  <span>¡Nuevo Récord Personal alcanzado en este ejercicio!</span>
                </div>
              )}

              {/* Sets Table */}
              <table className="sym-sets-table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>SERIE</th>
                    <th style={{ width: 70 }}>ANTERIOR</th>
                    <th>KG</th>
                    <th>REPS</th>
                    <th style={{ width: 44 }}>RIR</th>
                    <th style={{ width: 44 }}>✓</th>
                  </tr>
                </thead>
                <tbody>
                  {ex.sets.map((set, setIdx) => {
                    const prevDisplay = last
                      ? `${last.weightKg} × ${last.reps}`
                      : '-';

                    return (
                      <tr
                        key={set.id}
                        className={`sym-set-row ${set.completed ? 'completed' : ''}`}
                      >
                        <td className="sym-set-index">
                          <button
                            type="button"
                            onClick={() => deleteSet(exIdx, setIdx)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--sym-text-muted)',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              fontSize: 11,
                              marginRight: 2,
                            }}
                            title="Eliminar serie"
                          >
                            ×
                          </button>
                          {setIdx + 1}
                        </td>
                        <td className="sym-set-cell sym-set-prev">{prevDisplay}</td>
                        <td className="sym-set-cell">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="sym-input-number"
                            placeholder="0"
                            value={set.weightKg}
                            onChange={(e) =>
                              updateSetValue(exIdx, setIdx, 'weightKg', e.target.value)
                            }
                          />
                        </td>
                        <td className="sym-set-cell">
                          <input
                            type="text"
                            inputMode="numeric"
                            className="sym-input-number"
                            placeholder="0"
                            value={set.reps}
                            onChange={(e) =>
                              updateSetValue(exIdx, setIdx, 'reps', e.target.value)
                            }
                          />
                        </td>
                        <td className="sym-set-cell">
                          <input
                            type="text"
                            inputMode="numeric"
                            className="sym-input-number"
                            style={{ width: 40 }}
                            placeholder="-"
                            value={set.rir}
                            onChange={(e) =>
                              updateSetValue(exIdx, setIdx, 'rir', e.target.value)
                            }
                          />
                        </td>
                        <td className="sym-set-cell">
                          <button
                            type="button"
                            className={`sym-check-btn ${set.completed ? 'checked' : ''}`}
                            onClick={() => toggleSetCompleted(exIdx, setIdx)}
                            aria-label="Completar serie"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <button
                type="button"
                className="sym-add-set-btn"
                onClick={() => addSet(exIdx)}
              >
                + Añadir Serie
              </button>
            </div>
          );
        })
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
