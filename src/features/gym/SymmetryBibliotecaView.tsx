import React, { useState, useMemo, useEffect } from 'react';
import {
  SymmetryExerciseVisual,
  ROUTINE_COLLAGES,
  getExerciseInitials,
  resolveExerciseImage,
} from './SymmetryExerciseVisual';
import { SymmetryIcon } from './components/SymmetryIcon';
import { SymmetryMuscleIcon } from './components/SymmetryMuscleIcon';
import { exerciseMuscles, muscleDistribution, musclesText } from '../../data/symmetry/symmetryMuscles';
import { SymmetryExercisePicker } from './SymmetryExercisePicker';
import {
  SYMMETRY_EXERCISES,
  findSymmetryExercise,
  type SymmetryExercise,
} from '../../data/symmetry/symmetryCatalog';
import { assetUrl } from '../../data/symmetry/assetHelper';
import { getLibraryExercises } from '../../data/symmetry/symmetryExerciseMedia';

const PAGE_SIZE = 40;

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Pecho',
  delts: 'Hombros',
  back: 'Espalda',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebrazos',
  quads: 'Cuádriceps',
  hamstrings: 'Femorales',
  glutes: 'Glúteos',
  calves: 'Gemelos',
  adductors: 'Aductores',
  abductors: 'Abductores',
  abs: 'Abdominales',
  neck: 'Cuello',
  cardio: 'Cardio',
};

/** Case- and accent-insensitive search key ("jalon" finds "Jalón"). */
function normalizeSearch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

export interface RoutineTemplate {
  id: string;
  name: string;
  category: 'pull' | 'push' | 'legs' | 'upper' | 'fullbody' | 'custom';
  durationMin: number;
  collageKey?: string;
  muscleDistribution: { muscle: string; label: string; percent: number }[];
  exerciseIds: number[];
  isCustom?: boolean;
}

export const DEFAULT_TEMPLATES: RoutineTemplate[] = [
  {
    id: 'traccion-a',
    name: 'Tracción A',
    category: 'pull',
    durationMin: 60,
    collageKey: 'traccion_a',
    muscleDistribution: [
      { muscle: 'lats', label: 'Dorsales', percent: 40 },
      { muscle: 'back', label: 'Espalda', percent: 20 },
      { muscle: 'biceps', label: 'Bíceps', percent: 20 },
    ],
    exerciseIds: [19, 18, 12, 26, 25], // Jalón prono, Remo sentado, Remo mancuerna, Curl inclinado, Curl martillo
  },
  {
    id: 'empuje-a',
    name: 'Empuje A',
    category: 'push',
    durationMin: 60,
    collageKey: 'empuje_a',
    muscleDistribution: [
      { muscle: 'chest', label: 'Pecho', percent: 50 },
      { muscle: 'shoulders', label: 'Hombros', percent: 30 },
      { muscle: 'triceps', label: 'Tríceps', percent: 20 },
    ],
    exerciseIds: [8, 14, 17, 9, 28], // Press plano, Press inclinado, Pec deck, Laterales, Tríceps polea
  },
  {
    id: 'pierna-a',
    name: 'Pierna',
    category: 'legs',
    durationMin: 60,
    collageKey: 'pierna',
    muscleDistribution: [
      { muscle: 'quads', label: 'Cuádriceps', percent: 50 },
      { muscle: 'hamstrings', label: 'Femorales', percent: 30 },
      { muscle: 'calves', label: 'Gemelos', percent: 20 },
    ],
    exerciseIds: [2, 6, 4, 7, 5], // Prensa 45, Extensión, Búlgara, Gemelos, Peso muerto rumano
  },
  {
    id: 'traccion-b',
    name: 'Tracción B',
    category: 'pull',
    durationMin: 55,
    collageKey: 'traccion_b',
    muscleDistribution: [
      { muscle: 'back', label: 'Espalda', percent: 40 },
      { muscle: 'lats', label: 'Dorsales', percent: 30 },
      { muscle: 'biceps', label: 'Bíceps', percent: 30 },
    ],
    exerciseIds: [21, 49, 24, 23, 13], // Remo barra, Remo polea alta, Curl EZ, Curl bayesian, Encogimientos
  },
  {
    id: 'empuje-b',
    name: 'Empuje B',
    category: 'push',
    durationMin: 55,
    collageKey: 'empuje_b',
    muscleDistribution: [
      { muscle: 'shoulders', label: 'Hombros', percent: 40 },
      { muscle: 'chest', label: 'Pecho', percent: 40 },
      { muscle: 'triceps', label: 'Tríceps', percent: 20 },
    ],
    exerciseIds: [14, 8, 9, 17, 28],
  },
];

export const STORAGE_CUSTOM_ROUTINES = 'symmetry_custom_routines_v1';

export function loadSavedCustomRoutines(): RoutineTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_ROUTINES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

interface SymmetryBibliotecaViewProps {
  onStartRoutine: (template: RoutineTemplate) => void;
  onSelectExercise?: (exercise: SymmetryExercise) => void;
}

export const SymmetryBibliotecaView: React.FC<SymmetryBibliotecaViewProps> = ({
  onStartRoutine,
  onSelectExercise,
}) => {
  const [filterPill, setFilterPill] = useState<'smart' | 'programs' | 'templates' | 'exercises'>('templates');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<RoutineTemplate | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [customRoutines, setCustomRoutines] = useState<RoutineTemplate[]>([]);

  // Create routine form state
  const [newRoutineName, setNewRoutineName] = useState('');
  const [newRoutineCategory, setNewRoutineCategory] = useState<'push' | 'pull' | 'legs' | 'fullbody'>('push');
  const [newRoutineExercises, setNewRoutineExercises] = useState<SymmetryExercise[]>([]);

  // Load custom routines from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CUSTOM_ROUTINES);
      if (raw) {
        setCustomRoutines(JSON.parse(raw));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const saveCustomRoutine = () => {
    if (!newRoutineName.trim()) return;
    const newRoutine: RoutineTemplate = {
      id: `custom-${Date.now()}`,
      name: newRoutineName.trim(),
      category: newRoutineCategory,
      durationMin: Math.max(30, newRoutineExercises.length * 12),
      isCustom: true,
      muscleDistribution: [
        { muscle: newRoutineCategory === 'push' ? 'chest' : newRoutineCategory === 'pull' ? 'back' : 'quads', label: 'Principal', percent: 60 },
        { muscle: 'arms', label: 'Secundario', percent: 40 },
      ],
      exerciseIds: newRoutineExercises.map((e) => e.id),
    };

    const updated = [newRoutine, ...customRoutines];
    setCustomRoutines(updated);
    try {
      localStorage.setItem(STORAGE_CUSTOM_ROUTINES, JSON.stringify(updated));
    } catch {
      /* ignore */
    }

    setShowCreateModal(false);
    setNewRoutineName('');
    setNewRoutineExercises([]);
    setSelectedTemplate(newRoutine);
  };

  // Bundled catalog + templates downloaded from the user's Symmetry session (see GymView refresh).
  const [mediaVersion, setMediaVersion] = useState(0);
  useEffect(() => {
    const bump = () => setMediaVersion((v) => v + 1);
    window.addEventListener('symmetry-media-updated', bump);
    return () => window.removeEventListener('symmetry-media-updated', bump);
  }, []);
  const libraryExercises = useMemo(() => getLibraryExercises(), [mediaVersion]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => setVisibleCount(PAGE_SIZE), [searchQuery]);
  const matchingExercises = useMemo(() => {
    const q = normalizeSearch(searchQuery);
    return q ? libraryExercises.filter((e) => normalizeSearch(e.name).includes(q)) : libraryExercises;
  }, [libraryExercises, searchQuery]);

  const allTemplates = useMemo(() => {
    return [...customRoutines, ...DEFAULT_TEMPLATES];
  }, [customRoutines]);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allTemplates;
    return allTemplates.filter((t) => t.name.toLowerCase().includes(q));
  }, [allTemplates, searchQuery]);

  // If a template is selected -> Render Template Detail Screen (Screenshot 7)
  if (selectedTemplate) {
    const exercises = selectedTemplate.exerciseIds
      .map((id) => findSymmetryExercise(id))
      .filter((e): e is SymmetryExercise => e !== null && e !== undefined);

    return (
      <div className="sym-template-detail-screen" style={{ padding: '4px 0 80px' }}>
        {/* Top Bar with back chevron */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setSelectedTemplate(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              fontSize: 22,
              cursor: 'pointer',
              padding: '6px 12px 6px 0',
            }}
          >
            ←
          </button>
        </div>

        {/* Title & Subtitle */}
        <h1
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: '#FFFFFF',
            margin: '8px 0 6px',
            letterSpacing: '-0.4px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {selectedTemplate.name}
        </h1>
        <div style={{ fontSize: 16, color: '#8E8E93', marginBottom: 34 }}>
          {exercises.length} Ejercicios, {selectedTemplate.durationMin} min
        </div>

        {/* Distribución Muscular: derived from each exercise's focus/secondary muscles */}
        <section style={{ marginBottom: 30 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#FFFFFF', margin: '0 0 16px' }}>Distribución Muscular</h3>

          <div style={{ display: 'flex', gap: 22, overflowX: 'auto', paddingBottom: 6, scrollbarWidth: 'none' }}>
            {muscleDistribution(exercises.map(exerciseMuscles)).map((md) => (
              <div key={md.key} style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <SymmetryMuscleIcon muscle={md.key} size={66} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', marginBottom: 6 }}>{md.label}</div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: '#2C2C2E',
                      color: '#FFFFFF',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    {md.percent}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Exercises List Section */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#FFFFFF', margin: 0 }}>{exercises.length} Ejercicios</h3>

            <button
              type="button"
              onClick={() => setShowExercisePicker(true)}
              aria-label="Añadir ejercicio"
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#1C1C1E',
                border: 'none',
                color: '#FFFFFF',
                fontSize: 22,
                lineHeight: 1,
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              +
            </button>
          </div>

          <div>
            {exercises.map((ex, index) => {
              const gif = resolveExerciseImage(ex);
              return (
                <div
                  key={`${ex.id}-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 0',
                    borderBottom: index < exercises.length - 1 ? '1px solid #1C1C1E' : 'none',
                  }}
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      flexShrink: 0,
                      borderRadius: 12,
                      background: '#FFFFFF',
                      overflow: 'hidden',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {gif ? (
                      <img src={gif} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ color: '#111', fontWeight: 800, fontSize: 13 }}>{getExerciseInitials(ex.name)}</span>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', lineHeight: 1.3 }}>{ex.name}</div>
                    <div style={{ fontSize: 13, color: '#8E8E93', marginTop: 4 }}>{musclesText(exerciseMuscles(ex))}</div>
                  </div>

                  <button
                    type="button"
                    title="Reemplazar ejercicio"
                    aria-label="Reemplazar ejercicio"
                    onClick={() => setReplaceIndex(index)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, flexShrink: 0 }}
                  >
                    <SymmetryIcon name="controls/icon_replace_shuffle" color="#3B82F6" size={24} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {replaceIndex !== null && (
          <SymmetryExercisePicker
            onClose={() => setReplaceIndex(null)}
            onSelect={(ex) => {
              const ids = [...selectedTemplate.exerciseIds];
              ids[replaceIndex] = ex.id;
              setSelectedTemplate({ ...selectedTemplate, exerciseIds: ids });
              setReplaceIndex(null);
            }}
          />
        )}

        {/* Sticky bottom Empezar Entrenamiento button (Screenshot 7) */}
        <div
          style={{
            position: 'fixed',
            // Above the app tab bar (~62px) and the gym section bar (56px).
            bottom: 'calc(118px + env(safe-area-inset-bottom, 0px))',
            left: 0,
            right: 0,
            maxWidth: 480,
            margin: '0 auto',
            padding: '12px 16px',
            background: 'linear-gradient(to top, #090a0c 80%, transparent)',
            zIndex: 40,
          }}
        >
          <button
            type="button"
            onClick={() => onStartRoutine(selectedTemplate)}
            style={{
              width: '100%',
              padding: '18px 20px',
              borderRadius: 16,
              background: '#FFFFFF',
              color: '#000000',
              border: 'none',
              fontSize: 17,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
            }}
          >
            <span style={{ fontSize: 18 }}>▶</span> Empezar Entrenamiento
          </button>
        </div>

        {showExercisePicker && (
          <SymmetryExercisePicker
            onClose={() => setShowExercisePicker(false)}
            onSelect={(ex) => {
              const updated = {
                ...selectedTemplate,
                exerciseIds: [...selectedTemplate.exerciseIds, ex.id],
              };
              setSelectedTemplate(updated);
            }}
          />
        )}
      </div>
    );
  }

  // BIBLIOTECA ROOT LIST (Screenshot 4)
  return (
    <div className="sym-biblioteca-screen" style={{ padding: '4px 0 32px' }}>
      {/* Header with profile icon, Title, search, and + button */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          padding: '0 4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#1e2129',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              fontSize: 16,
            }}
          >
            👤
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', margin: 0 }}>
            Mi biblioteca
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            type="button"
            onClick={() => {}}
            style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: 20, cursor: 'pointer' }}
          >
            🔍
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              fontSize: 24,
              fontWeight: 300,
              cursor: 'pointer',
            }}
          >
            +
          </button>
        </div>
      </header>

      {/* Filter Pills: Tu plan inteligente, Programas, Plantillas, Ejercicios */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 18, paddingBottom: 4 }}>
        {[
          { key: 'smart', label: 'Tu plan inteligente' },
          { key: 'programs', label: 'Programas' },
          { key: 'templates', label: 'Plantillas' },
          { key: 'exercises', label: 'Ejercicios' },
        ].map((p) => {
          const isActive = filterPill === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setFilterPill(p.key as any)}
              style={{
                padding: '8px 16px',
                borderRadius: 24,
                background: isActive ? '#1c1e26' : '#101114',
                color: isActive ? '#ffffff' : '#828796',
                border: isActive ? '1.5px solid rgba(147, 197, 253, 0.4)' : '1px solid #1f2127',
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Subheader: Recientes & Grid toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          padding: '0 4px',
          color: '#9ca3af',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>↓↑</span> Recientes
        </div>
        <div style={{ fontSize: 16 }}>⊞</div>
      </div>

      {/* Content: Exercises or Routines List */}
      {filterPill === 'exercises' ? (
        <div>
          <div style={{ marginBottom: 14 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar ejercicio..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 12,
                background: '#121317',
                border: '1px solid #1f2127',
                color: '#ffffff',
                fontSize: 14,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', margin: '0 4px 10px' }}>
            {matchingExercises.length} ejercicios
            {libraryExercises.length === SYMMETRY_EXERCISES.length && ' · conecta Symmetry para ver el catálogo completo'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {matchingExercises
              .slice(0, visibleCount)
              .map((ex) => (
                <div
                  key={ex.id}
                  onClick={() => onSelectExercise?.(ex)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 14,
                    background: '#121317',
                    border: '1px solid #1c1e25',
                    cursor: onSelectExercise ? 'pointer' : 'default',
                  }}
                >
                  <SymmetryExerciseVisual exercise={ex} variant="thumbnail" size={44} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>{ex.name}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{MUSCLE_LABELS[ex.primaryMuscle] ?? ex.primaryMuscle}</div>
                  </div>
                  <div style={{ color: '#38bdf8', fontSize: 16 }}>›</div>
                </div>
              ))}
          </div>
          {matchingExercises.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              style={{
                width: '100%',
                marginTop: 12,
                padding: '10px 0',
                borderRadius: 12,
                background: '#14151a',
                border: '1px solid #22252e',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Mostrar más ({matchingExercises.length - visibleCount})
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredTemplates.map((t) => {
            const collageImg = t.collageKey ? ROUTINE_COLLAGES[t.collageKey] : null;

            return (
              <div
                key={t.id}
                onClick={() => setSelectedTemplate(t)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 14px',
                  borderRadius: 18,
                  background: '#121317',
                  border: '1px solid #1c1e25',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                {/* 2x2 Collage Thumbnail */}
                <div
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 14,
                    overflow: 'hidden',
                    background: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                  }}
                >
                  {collageImg ? (
                    <img
                      src={assetUrl(collageImg)}
                      alt={t.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 900, color: '#000000' }}>
                      {t.name.slice(0, 3).toUpperCase()}
                    </span>
                  )}
                </div>

                <div>
                  <h4 style={{ fontSize: 16, fontWeight: 800, color: '#ffffff', margin: '0 0 4px' }}>
                    {t.name}
                  </h4>
                  <div style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>📋</span> Plantilla · {t.exerciseIds.length} ejercicios
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Custom Routine Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'flex-end',
            zIndex: 100,
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              margin: '0 auto',
              background: '#121317',
              borderRadius: '24px 24px 0 0',
              padding: 24,
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', margin: 0 }}>
                Crear Nueva Rutina
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>
                  Nombre de la rutina
                </label>
                <input
                  type="text"
                  placeholder="Ej: Empuje y Hombro Foco"
                  value={newRoutineName}
                  onChange={(e) => setNewRoutineName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: '#1a1c24',
                    border: '1px solid #282b35',
                    color: '#ffffff',
                    fontSize: 15,
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>
                  Tipo de entrenamiento
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['push', 'pull', 'legs', 'fullbody'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewRoutineCategory(cat)}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: 10,
                        background: newRoutineCategory === cat ? '#2563eb' : '#1a1c24',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: 'capitalize',
                        cursor: 'pointer',
                      }}
                    >
                      {cat === 'push' ? 'Empuje' : cat === 'pull' ? 'Tracción' : cat === 'legs' ? 'Pierna' : 'Cuerpo'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: '#9ca3af' }}>
                    Ejercicios ({newRoutineExercises.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowExercisePicker(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#38bdf8',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    + Añadir ejercicio
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                  {newRoutineExercises.length === 0 ? (
                    <div style={{ padding: '16px 0', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                      Añade ejercicios a tu rutina tocando el botón de arriba.
                    </div>
                  ) : (
                    newRoutineExercises.map((ex, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: 10,
                          background: '#181a20',
                        }}
                      >
                        <span style={{ fontSize: 13, color: '#ffffff', fontWeight: 600 }}>{ex.name}</span>
                        <button
                          type="button"
                          onClick={() => setNewRoutineExercises(newRoutineExercises.filter((_, idx) => idx !== i))}
                          style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 16, cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={saveCustomRoutine}
                disabled={!newRoutineName.trim()}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 14,
                  background: newRoutineName.trim() ? '#ffffff' : '#22252e',
                  color: newRoutineName.trim() ? '#000000' : '#6b7280',
                  border: 'none',
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: newRoutineName.trim() ? 'pointer' : 'not-allowed',
                  marginTop: 10,
                }}
              >
                Guardar Rutina
              </button>
            </div>
          </div>
        </div>
      )}

      {showExercisePicker && (
        <SymmetryExercisePicker
          onClose={() => setShowExercisePicker(false)}
          onSelect={(ex) => setNewRoutineExercises([...newRoutineExercises, ex])}
        />
      )}
    </div>
  );
};
