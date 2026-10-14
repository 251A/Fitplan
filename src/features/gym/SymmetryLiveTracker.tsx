import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAppData } from '../../app/AppData';
import { dateKey } from '../../domain/dates';
import type { GymSession, SetEntry, Exercise } from '../../data/db/models';
import { saveGymSessions, saveExercises } from '../../data/db/repository';
import { findSymmetryExercise, type SymmetryExercise } from '../../data/symmetry/symmetryCatalog';
import { isSymmetryConnected, pushWorkoutToSymmetry } from '../../data/symmetry/symmetryApi';
import { getExerciseMedia } from '../../data/symmetry/symmetryExerciseMedia';
import { lastSetFor, suggestNextSet } from './gymStats';
import { SymmetryExercisePicker } from './SymmetryExercisePicker';
import { SymmetryExerciseVisual, getExerciseInitials, resolveExerciseImage } from './SymmetryExerciseVisual';
import { assetUrl } from '../../data/symmetry/assetHelper';
import { LOTTIE, SymmetryLottie } from './components/SymmetryLottie';
import { SymmetryIcon } from './components/SymmetryIcon';

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

const MOTIVATION = [
  'Haz cada repetición con decisión.',
  'Controla la bajada, explota al subir.',
  'Calidad antes que peso.',
  'Una repetición más que la última vez.',
  'Respira, aprieta y empuja.',
];

const REST_OPTIONS = [60, 90, 120, 180];

function formatRest(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}:${String(s).padStart(2, '0')}min` : `${m}min`;
}

const SET_GRID = '56px 1fr 1fr 56px';

function setInputStyle(completed: boolean): CSSProperties {
  return {
    height: 54,
    minWidth: 0,
    borderRadius: 10,
    background: '#1C1C1E',
    border: 'none',
    color: completed ? '#FFFFFF' : '#E5E5EA',
    fontSize: 20,
    fontWeight: 500,
    textAlign: 'center',
    outline: 'none',
  };
}

const LINK_BUTTON: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#8E8E93',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 4,
};

const INSTRUCTIONS_TEXT: CSSProperties = {
  margin: '14px 0 0',
  fontSize: 14,
  lineHeight: 1.55,
  color: '#D1D1D6',
  whiteSpace: 'pre-line',
};

/** Circular preview in the top carousel: the exercise GIF (white background, worked muscles in red). */
function TrackerBubble({ exercise, active, onClick }: { exercise: TrackerExercise; active: boolean; onClick: () => void }) {
  const gif = resolveExerciseImage({ id: exercise.symmetryId, name: exercise.name });
  return (
    <button
      type="button"
      aria-label={exercise.name}
      aria-pressed={active}
      onClick={onClick}
      style={{
        width: 84,
        height: 84,
        flexShrink: 0,
        // Black gap between the ring and the white GIF so the active ring stands out.
        padding: 3,
        borderRadius: '50%',
        background: '#000000',
        border: active ? '3px solid #FFFFFF' : '1.5px solid #2C2C2E',
        cursor: 'pointer',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          overflow: 'hidden',
          background: '#FFFFFF',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {gif ? (
          <img src={gif} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ color: '#111', fontWeight: 800, fontSize: 13 }}>{getExerciseInitials(exercise.name)}</span>
        )}
      </div>
    </button>
  );
}

function ActionPill({ icon, label, onClick, active = false }: { icon: string; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 22px',
        borderRadius: 999,
        background: active ? '#2C2C2E' : '#1C1C1E',
        border: 'none',
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <SymmetryIcon name={icon} size={20} />
      {label}
    </button>
  );
}

function TrackerOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(0,0,0,.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0B0B0C',
          border: '1px solid #2C2C2E',
          borderRadius: 20,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF' }}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ ...LINK_BUTTON, fontSize: 20, color: '#FFFFFF' }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
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
  const { db, exercises, gymSessions, bestSets, timeZone, reload } = useAppData();

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
  const [saved, setSaved] = useState(false);
  const [restDuration, setRestDuration] = useState(90);
  const [pickerMode, setPickerMode] = useState<'add' | 'replace'>('add');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showNotes, setShowNotes] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  // After saving, the check animation plays and then the tracker closes (with a fallback timeout).
  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(onDone, 2500);
    return () => window.clearTimeout(t);
  }, [saved, onDone]);

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

  // Set toggle & rest trigger. Empty inputs take the greyed previous values shown as placeholders.
  function toggleSetCompleted(
    exerciseIndex: number,
    setIndex: number,
    fallback: { weightKg: string; reps: string } = { weightKg: '', reps: '' },
  ) {
    setWorkoutExercises((prev) => {
      const copy = [...prev];
      const targetEx = copy[exerciseIndex];
      if (!targetEx) return prev;
      const targetSet = targetEx.sets[setIndex];
      if (!targetSet) return prev;

      const nextCompleted = !targetSet.completed;
      const updatedSets = [...targetEx.sets];
      updatedSets[setIndex] = {
        ...targetSet,
        weightKg: nextCompleted && targetSet.weightKg === '' ? fallback.weightKg : targetSet.weightKg,
        reps: nextCompleted && targetSet.reps === '' ? fallback.reps : targetSet.reps,
        completed: nextCompleted,
      };
      copy[exerciseIndex] = { ...targetEx, sets: updatedSets };

      if (nextCompleted) setRestSecondsLeft(restDuration);
      return copy;
    });
  }

  // ✨ Fill pending, empty sets with the deterministic double-progression target.
  function applySuggestion(exerciseIndex: number) {
    const ex = workoutExercises[exerciseIndex];
    if (!ex) return;
    const s = suggestNextSet(ex.exerciseId, ex.implement, gymSessions, bestSets);
    if (!s) {
      setStatusMessage('Sin historial para sugerir carga en este ejercicio todavía.');
      return;
    }
    setWorkoutExercises((prev) =>
      prev.map((e, i) =>
        i !== exerciseIndex
          ? e
          : {
              ...e,
              sets: e.sets.map((set) =>
                set.completed
                  ? set
                  : {
                      ...set,
                      weightKg: set.weightKg === '' ? String(s.weightKg) : set.weightKg,
                      reps: set.reps === '' ? String(s.reps) : set.reps,
                    },
              ),
            },
      ),
    );
    setStatusMessage(
      s.progressed
        ? `Doble progresión: sube a ${s.weightKg} kg × ${s.reps}.`
        : `Repite ${s.weightKg} kg × ${s.reps} e intenta sumar repeticiones.`,
    );
  }

  function openPicker(mode: 'add' | 'replace') {
    setPickerMode(mode);
    setShowPicker(true);
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

    // Values stay empty: the previous top set is shown greyed as placeholder and used on completion.
    const newTrackedEx: TrackerExercise = {
      uid: `ex-${Date.now()}-${Math.random()}`,
      exerciseId: exId,
      symmetryId: symEx.id,
      name: symEx.name,
      implement: symEx.implement,
      category: symEx.category,
      primaryMuscle: symEx.primaryMuscle,
      loadDivisor: symEx.loadDivisor,
      sets: [1, 2, 3].map((n) => ({ id: `set-${Date.now()}-${n}`, weightKg: '', reps: '', rir: '', completed: false })),
    };

    if (pickerMode === 'replace') {
      setWorkoutExercises((prev) =>
        prev.length === 0 ? [newTrackedEx] : prev.map((e, i) => (i === activeExerciseIndex ? newTrackedEx : e)),
      );
    } else {
      setWorkoutExercises((prev) => [...prev, newTrackedEx]);
      setActiveExerciseIndex(workoutExercises.length);
    }
  }

  /** Per-exercise notes ("Ejercicio: nota"), appended to any note the session already had. */
  function sessionNote(): string | undefined {
    const lines = workoutExercises
      .map((e) => (notes[e.uid]?.trim() ? `${e.name}: ${notes[e.uid]!.trim()}` : ''))
      .filter(Boolean);
    const all = [existingSession?.note?.trim(), ...lines].filter(Boolean);
    return all.length ? all.join('\n') : undefined;
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
      note: sessionNote(),
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
      setSaved(true);
    } catch (err) {
      alert(`Error al guardar sesión: ${(err as Error).message}`);
      setIsFinishing(false);
    }
  }

  return (
    <div className="symmetry-container sym-live-tracker">
      {/* Top bar: collapse + elapsed time | rest timer, settings, Terminar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 2px',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            type="button"
            aria-label="Salir del entrenamiento"
            onClick={() => {
              if (workoutExercises.some((e) => e.sets.some((s) => s.completed))) {
                if (!confirm('¿Deseas salir del entrenamiento en curso?')) return;
              }
              onDone();
            }}
            style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'grid' }}
          >
            <SymmetryIcon name="chevron_up" size={24} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
            {formatTimer(elapsedSeconds)}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <button
            type="button"
            aria-label="Temporizador de descanso"
            onClick={() => setRestSecondsLeft(restDuration)}
            style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'grid' }}
          >
            <SymmetryIcon name="lucide_clock" size={24} />
          </button>
          <button
            type="button"
            aria-label="Nombre del entrenamiento"
            onClick={() => {
              const next = prompt('Nombre del entrenamiento', sessionName);
              if (next !== null && next.trim()) setSessionName(next.trim());
            }}
            style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'grid' }}
          >
            <SymmetryIcon name="icon_settings" size={24} />
          </button>
          <button
            type="button"
            onClick={handleFinishSession}
            disabled={isFinishing}
            style={{
              padding: '10px 20px',
              borderRadius: 12,
              background: '#0B0B0C',
              border: '1px solid #3A3A3C',
              color: '#FFFFFF',
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {isFinishing ? 'Guardando…' : 'Terminar'}
          </button>
        </div>
      </header>

      {statusMessage && (
        <div className="sym-alert-box info" style={{ marginBottom: 16 }}>
          {statusMessage}
        </div>
      )}

      {/* Exercise carousel: circular previews, active one ringed in white */}
      {workoutExercises.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 14,
            overflowX: 'auto',
            padding: '4px 2px 14px',
            marginBottom: 6,
            scrollbarWidth: 'none',
          }}
        >
          {workoutExercises.map((ex, idx) => (
            <TrackerBubble
              key={ex.uid}
              exercise={ex}
              active={idx === activeExerciseIndex}
              onClick={() => setActiveExerciseIndex(idx)}
            />
          ))}
        </div>
      )}

      {workoutExercises.length === 0 ? (
        <div
          style={{
            background: '#0B0B0C',
            borderRadius: 16,
            padding: '36px 20px',
            textAlign: 'center',
            border: '1px dashed #2C2C2E',
            marginBottom: 20,
          }}
        >
          <img
            src={assetUrl('symmetry/icons/dumbell_icon.svg')}
            alt=""
            style={{ width: 44, height: 44, opacity: 0.4, marginBottom: 12, filter: 'invert(1)' }}
          />
          <h3 style={{ color: '#FFFFFF', margin: '0 0 6px' }}>Tu entrenamiento está vacío</h3>
          <p style={{ color: '#8E8E93', fontSize: 14, margin: '0 0 16px' }}>
            Añade ejercicios de Symmetry para empezar a registrar tus series.
          </p>
          <button type="button" className="sym-btn-primary" style={{ margin: '0 auto' }} onClick={() => openPicker('add')}>
            + Añadir Ejercicio
          </button>
        </div>
      ) : (
        (() => {
          const ex = workoutExercises[activeExerciseIndex] ?? workoutExercises[0];
          if (!ex) return null;
          const exIdx = activeExerciseIndex;
          const last = lastSetFor(ex.exerciseId, gymSessions, bestSets);
          const media = getExerciseMedia(ex.symmetryId);
          const heroGif = resolveExerciseImage({ id: ex.symmetryId, name: ex.name });
          const doneSets = ex.sets.filter((s) => s.completed).length;
          const progress = ex.sets.length ? doneSets / ex.sets.length : 0;
          const placeholderKg = last ? String(last.weightKg) : '0';
          const placeholderReps = last ? String(last.reps) : '0';

          return (
            <div key={ex.uid}>
              {/* Hero: the exercise GIF. Symmetry's 3D "video_angles" render needs the CDN path
                  pattern from the decompiled app; the filmed technique video lives behind "Tutorial". */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '1 / 1.08',
                  borderRadius: 20,
                  overflow: 'hidden',
                  background: '#FFFFFF',
                  marginBottom: 22,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {heroGif ? (
                  <img src={heroGif} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <SymmetryExerciseVisual exercise={{ id: ex.symmetryId, name: ex.name }} variant="hero" />
                )}

                {/* Thin progress rail: completed sets of this exercise */}
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '6%',
                    bottom: '30%',
                    width: 5,
                    borderRadius: 3,
                    background: '#2C2C2E',
                    display: 'flex',
                    alignItems: 'flex-end',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max(6, progress * 100)}%`,
                      borderRadius: 3,
                      background: '#FFFFFF',
                      transition: 'height .3s ease',
                    }}
                  />
                </div>

                {/* "S" button: exercise instructions */}
                <button
                  type="button"
                  aria-label="Instrucciones del ejercicio"
                  onClick={() => setShowInstructions(true)}
                  style={{
                    position: 'absolute',
                    right: 14,
                    bottom: 14,
                    width: 58,
                    height: 58,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 50% 40%, #1b2a4a, #0b1220 70%)',
                    border: '1.5px solid #5B8DEF',
                    boxShadow: '0 0 18px rgba(59,130,246,.55)',
                    color: '#FFFFFF',
                    fontSize: 26,
                    fontWeight: 900,
                    fontFamily: 'Albert Sans, DM Sans, system-ui, sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  S
                </button>
              </div>

              {/* Title & motivational line */}
              <h2 style={{ fontSize: 19, fontWeight: 600, color: '#FFFFFF', margin: '0 0 8px' }}>{ex.name}</h2>
              <p style={{ fontSize: 16, color: '#8E8E93', margin: '0 0 18px' }}>
                {MOTIVATION[(ex.symmetryId ?? exIdx) % MOTIVATION.length]}
              </p>

              {/* Action pills */}
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', marginBottom: 26, scrollbarWidth: 'none' }}>
                <ActionPill icon="play_icon" label="Tutorial" onClick={() => setShowTutorial(true)} />
                <ActionPill icon="controls/icon_replace_arrows" label="Reemplazar" onClick={() => openPicker('replace')} />
                <ActionPill
                  icon="controls/icon_edit_pencil"
                  label="Notas"
                  active={showNotes || Boolean(notes[ex.uid])}
                  onClick={() => setShowNotes((v) => !v)}
                />
                <ActionPill
                  icon="lucide_clock"
                  label={formatRest(restDuration)}
                  onClick={() => setRestDuration((d) => REST_OPTIONS[(REST_OPTIONS.indexOf(d) + 1) % REST_OPTIONS.length] ?? 90)}
                />
              </div>

              {showNotes && (
                <textarea
                  value={notes[ex.uid] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [ex.uid]: e.target.value }))}
                  placeholder="Notas para este ejercicio…"
                  rows={2}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    marginBottom: 20,
                    padding: 12,
                    borderRadius: 12,
                    background: '#1C1C1E',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: 14,
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
              )}

              {/* Sets table */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: SET_GRID,
                  gap: 12,
                  alignItems: 'center',
                  color: '#8E8E93',
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: 0.6,
                  marginBottom: 14,
                }}
              >
                <div style={{ textAlign: 'center' }}>SERIE</div>
                <div style={{ textAlign: 'center' }}>KG</div>
                <div style={{ textAlign: 'center' }}>REPES</div>
                <button
                  type="button"
                  aria-label="Sugerir carga"
                  title="Sugerir carga (doble progresión)"
                  onClick={() => applySuggestion(exIdx)}
                  style={{
                    width: 46,
                    height: 46,
                    justifySelf: 'center',
                    borderRadius: '50%',
                    background: '#0B1220',
                    border: '1.5px solid #3B82F6',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <SymmetryIcon name="icon_sparkles" color="#3B82F6" size={22} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {ex.sets.map((set, setIdx) => (
                  <div
                    key={set.id}
                    style={{ display: 'grid', gridTemplateColumns: SET_GRID, gap: 12, alignItems: 'center' }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        justifySelf: 'center',
                        borderRadius: 8,
                        background: '#1C1C1E',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#8E8E93',
                        fontWeight: 600,
                        fontSize: 15,
                      }}
                    >
                      {setIdx + 1}
                    </div>

                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Kilos serie ${setIdx + 1}`}
                      value={set.weightKg}
                      placeholder={placeholderKg}
                      onChange={(e) => updateSetValue(exIdx, setIdx, 'weightKg', e.target.value)}
                      style={setInputStyle(set.completed)}
                    />

                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`Repeticiones serie ${setIdx + 1}`}
                      value={set.reps}
                      placeholder={placeholderReps}
                      onChange={(e) => updateSetValue(exIdx, setIdx, 'reps', e.target.value)}
                      style={setInputStyle(set.completed)}
                    />

                    <button
                      type="button"
                      aria-label={set.completed ? 'Marcar serie pendiente' : 'Completar serie'}
                      onClick={() =>
                        toggleSetCompleted(exIdx, setIdx, { weightKg: last ? String(last.weightKg) : '', reps: last ? String(last.reps) : '' })
                      }
                      style={{
                        width: 46,
                        height: 46,
                        justifySelf: 'center',
                        borderRadius: '50%',
                        background: set.completed ? '#3B82F6' : '#2C2C2E',
                        border: 'none',
                        boxShadow: '0 4px 10px rgba(0,0,0,.45)',
                        color: set.completed ? '#FFFFFF' : '#C7C7CC',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                        fontSize: 20,
                        transition: 'background .2s ease',
                      }}
                    >
                      ✓
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addSet(exIdx)}
                style={{
                  width: '100%',
                  marginTop: 20,
                  padding: '16px 0',
                  borderRadius: 12,
                  background: '#1C1C1E',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: 17,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                +&nbsp;&nbsp;Añadir serie
              </button>

              {/* Secondary actions */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 22, margin: '14px 0 26px' }}>
                {ex.sets.length > 1 && (
                  <button type="button" onClick={() => deleteSet(exIdx, ex.sets.length - 1)} style={LINK_BUTTON}>
                    Quitar última serie
                  </button>
                )}
                {workoutExercises.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      deleteExercise(exIdx);
                      setActiveExerciseIndex((prev) => Math.max(0, prev - 1));
                    }}
                    style={{ ...LINK_BUTTON, color: '#FF6961' }}
                  >
                    Eliminar ejercicio
                  </button>
                )}
              </div>

              {showTutorial && (
                <TrackerOverlay title={ex.name} onClose={() => setShowTutorial(false)}>
                  {media?.videoUrl ? (
                    <video
                      src={media.videoUrl}
                      controls
                      autoPlay
                      loop
                      muted
                      playsInline
                      style={{ width: '100%', borderRadius: 16, background: '#000' }}
                    />
                  ) : (
                    <div style={{ borderRadius: 16, overflow: 'hidden', background: '#FFFFFF' }}>
                      <SymmetryExerciseVisual exercise={{ id: ex.symmetryId, name: ex.name }} variant="hero" />
                    </div>
                  )}
                  {media?.instructions && <p style={INSTRUCTIONS_TEXT}>{media.instructions}</p>}
                </TrackerOverlay>
              )}

              {showInstructions && (
                <TrackerOverlay title="Instrucciones" onClose={() => setShowInstructions(false)}>
                  <p style={INSTRUCTIONS_TEXT}>
                    {media?.instructions ?? 'Conecta Symmetry para ver las instrucciones de este ejercicio.'}
                  </p>
                </TrackerOverlay>
              )}
            </div>
          );
        })()
      )}

      {workoutExercises.length > 0 && (
        <button
          type="button"
          onClick={() => openPicker('add')}
          style={{
            width: '100%',
            marginBottom: 40,
            padding: '14px 0',
            borderRadius: 12,
            background: 'transparent',
            border: '1px solid #2C2C2E',
            color: '#FFFFFF',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Añadir ejercicio
        </button>
      )}

      {/* Floating Rest Timer Widget */}
      {restSecondsLeft !== null && (
        <div className="sym-rest-floating">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SymmetryLottie
              src={LOTTIE.sandTimer}
              size={36}
              fallback={<SymmetryIcon name="sand_clock_icon" color="grey" size={22} />}
            />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sym-text-muted)', textTransform: 'uppercase' }}>
                Descanso
              </div>
              <div className="sym-rest-timer-time">
                {formatTimer(restSecondsLeft)}
              </div>
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
          onSelect={(ex) => {
            void handleSelectExercise(ex);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {saved && (
        <div
          role="status"
          onClick={onDone}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            background: 'rgba(9,10,12,0.94)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <SymmetryLottie
            src={LOTTIE.check}
            size={140}
            loop={false}
            onComplete={onDone}
            fallback={<SymmetryIcon name="icon_success" color="blue" size={72} />}
          />
          <div style={{ fontSize: 20, fontWeight: 900, color: '#ffffff' }}>Entrenamiento guardado</div>
          {statusMessage && <div style={{ fontSize: 13, color: '#9ca3af' }}>{statusMessage}</div>}
        </div>
      )}
    </div>
  );
}
