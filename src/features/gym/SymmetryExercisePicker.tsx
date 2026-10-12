import { useMemo, useState } from 'react';
import {
  SYMMETRY_EXERCISES,
  IMPLEMENT_LABELS,
  type SymmetryExercise,
} from '../../data/symmetry/symmetryCatalog';
import type { Muscle } from '../../domain/strength/strength';

const MUSCLE_FILTERS: { key: string; label: string; svg?: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'chest', label: 'Pecho', svg: '/symmetry/icons/muscles/pecho.svg' },
  { key: 'back', label: 'Espalda', svg: '/symmetry/icons/muscles/dorsales.svg' },
  { key: 'shoulders', label: 'Hombros', svg: '/symmetry/icons/muscles/hombros.svg' },
  { key: 'biceps', label: 'Bíceps', svg: '/symmetry/icons/muscles/biceps.svg' },
  { key: 'triceps', label: 'Tríceps', svg: '/symmetry/icons/muscles/triceps.svg' },
  { key: 'quads', label: 'Cuádriceps', svg: '/symmetry/icons/muscles/cuadriceps.svg' },
  { key: 'hamstrings', label: 'Femorales', svg: '/symmetry/icons/muscles/femorales.svg' },
  { key: 'glutes', label: 'Glúteos', svg: '/symmetry/icons/muscles/gluteos.svg' },
  { key: 'abs', label: 'Abdomen', svg: '/symmetry/icons/muscles/abdominales.svg' },
];

const MUSCLE_SVG_MAP: Record<string, string> = {
  chest: '/symmetry/icons/muscles/pecho.svg',
  back: '/symmetry/icons/muscles/dorsales.svg',
  shoulders: '/symmetry/icons/muscles/hombros.svg',
  quads: '/symmetry/icons/muscles/cuadriceps.svg',
  hamstrings: '/symmetry/icons/muscles/femorales.svg',
  glutes: '/symmetry/icons/muscles/gluteos.svg',
  calves: '/symmetry/icons/muscles/gemelos.svg',
  biceps: '/symmetry/icons/muscles/biceps.svg',
  triceps: '/symmetry/icons/muscles/triceps.svg',
  forearms: '/symmetry/icons/muscles/antebrazos.svg',
  abs: '/symmetry/icons/muscles/abdominales.svg',
};

interface SymmetryExercisePickerProps {
  onSelect: (exercise: SymmetryExercise) => void;
  onClose: () => void;
  title?: string;
}

export function SymmetryExercisePicker({
  onSelect,
  onClose,
  title = 'Añadir Ejercicio',
}: SymmetryExercisePickerProps) {
  const [query, setQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('all');

  const filteredExercises = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SYMMETRY_EXERCISES.filter((ex) => {
      const matchQuery =
        !q ||
        ex.name.toLowerCase().includes(q) ||
        (IMPLEMENT_LABELS[ex.implement] ?? ex.implement).toLowerCase().includes(q);
      const matchMuscle = selectedMuscle === 'all' || ex.primaryMuscle === selectedMuscle;
      return matchQuery && matchMuscle;
    });
  }, [query, selectedMuscle]);

  return (
    <div className="sym-modal-overlay" onClick={onClose}>
      <div className="sym-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="sym-modal-header">
          <h2 className="sym-modal-title">
            <img
              src="/symmetry/icons/dumbell_icon.svg"
              alt=""
              style={{ width: 20, height: 20, filter: 'invert(1)' }}
            />
            {title}
          </h2>
          <button className="sym-modal-close-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="sym-modal-body">
          <input
            type="search"
            className="sym-search-input"
            placeholder="Buscar entre 155 ejercicios..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />

          <div className="sym-muscle-scroller">
            {MUSCLE_FILTERS.map((m) => (
              <button
                key={m.key}
                className={`sym-muscle-chip ${selectedMuscle === m.key ? 'active' : ''}`}
                onClick={() => setSelectedMuscle(m.key)}
                type="button"
              >
                {m.svg && <img src={m.svg} alt="" />}
                {m.label}
              </button>
            ))}
          </div>

          <div className="sym-picker-list">
            {filteredExercises.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--sym-text-muted)', padding: '24px 0' }}>
                No se encontraron ejercicios con ese filtro.
              </p>
            ) : (
              filteredExercises.map((ex) => {
                const muscleSvg =
                  MUSCLE_SVG_MAP[ex.primaryMuscle as Muscle] ?? '/symmetry/icons/muscles/pecho.svg';
                const implementLabel = IMPLEMENT_LABELS[ex.implement] ?? ex.implement;
                return (
                  <button
                    key={ex.id}
                    className="sym-picker-item"
                    type="button"
                    onClick={() => {
                      onSelect(ex);
                      onClose();
                    }}
                  >
                    <div className="sym-picker-item-icon">
                      <img src={muscleSvg} alt={ex.primaryMuscle} />
                    </div>
                    <div className="sym-picker-item-info">
                      <div className="sym-picker-item-name">{ex.name}</div>
                      <div className="sym-picker-item-sub">
                        <span className="sym-tag-pill">{implementLabel}</span>
                        {ex.loadDivisor === 2 && (
                          <span className="sym-tag-pill" style={{ marginLeft: 4, color: '#60a5fa' }}>
                            Por mancuerna
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ color: 'var(--sym-text-muted)', fontSize: 18 }}>+</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
