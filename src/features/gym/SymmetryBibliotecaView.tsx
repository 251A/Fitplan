import React, { useState, useMemo, useEffect } from 'react';
import {
  SymmetryExerciseVisual,
  ROUTINE_COLLAGES,
} from './SymmetryExerciseVisual';
import { SymmetryExercisePicker } from './SymmetryExercisePicker';
import {
  SYMMETRY_EXERCISES,
  findSymmetryExercise,
  getMuscleImage,
  type SymmetryExercise,
} from '../../data/symmetry/symmetryCatalog';

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

const DEFAULT_TEMPLATES: RoutineTemplate[] = [
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

const STORAGE_CUSTOM_ROUTINES = 'symmetry_custom_routines_v1';

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
            fontSize: 28,
            fontWeight: 900,
            color: '#ffffff',
            margin: '0 0 4px',
            letterSpacing: '-0.4px',
          }}
        >
          {selectedTemplate.name}
        </h1>
        <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>
          {exercises.length} Ejercicios, {selectedTemplate.durationMin} min
        </div>

        {/* Distribución Muscular Section */}
        <section style={{ marginBottom: 24 }}>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#ffffff',
              marginBottom: 12,
            }}
          >
            Distribución Muscular
          </h3>

          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
            {selectedTemplate.muscleDistribution.map((md, idx) => {
              const muscleImg = getMuscleImage(md.muscle, true);
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 14,
                    background: '#131418',
                    border: '1px solid #1f2128',
                    minWidth: 120,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: '#1a1d24',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={muscleImg}
                      alt=""
                      style={{ width: '80%', height: '80%', objectFit: 'contain' }}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
                      {md.label}
                    </div>
                    <div style={{ fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>
                      {md.percent}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Exercises List Section */}
        <section>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', margin: 0 }}>
              {exercises.length} Ejercicios
            </h3>

            <button
              type="button"
              onClick={() => setShowExercisePicker(true)}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#1c1e25',
                border: 'none',
                color: '#ffffff',
                fontSize: 18,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              +
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {exercises.map((ex, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 16,
                  background: '#121317',
                  border: '1px solid #1d1f27',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <SymmetryExerciseVisual exercise={ex} variant="thumbnail" size={54} />

                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', lineHeight: 1.25 }}>
                      {ex.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                      {ex.primaryMuscle.charAt(0).toUpperCase() + ex.primaryMuscle.slice(1)}
                    </div>
                  </div>
                </div>

                {/* Shuffle / Alternative icon */}
                <button
                  type="button"
                  title="Reemplazar ejercicio"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: 20,
                    cursor: 'pointer',
                    padding: 8,
                  }}
                >
                  🔀
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Sticky bottom Empezar Entrenamiento button (Screenshot 7) */}
        <div
          style={{
            position: 'fixed',
            bottom: 64,
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
              padding: '16px 20px',
              borderRadius: 28,
              background: '#ffffff',
              color: '#000000',
              border: 'none',
              fontSize: 16,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
            }}
          >
            <span>▶</span> Empezar Entrenamiento
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SYMMETRY_EXERCISES.filter((e) =>
              searchQuery ? e.name.toLowerCase().includes(searchQuery.toLowerCase()) : true,
            )
              .slice(0, 40)
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
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{ex.primaryMuscle}</div>
                  </div>
                  <div style={{ color: '#38bdf8', fontSize: 16 }}>›</div>
                </div>
              ))}
          </div>
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
                      src={collageImg}
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
