import { useMemo, useState } from 'react';
import {
  SYMMETRY_EXERCISES,
  IMPLEMENT_LABELS,
  getMuscleImage,
  getEquipmentImage,
  type SymmetryExercise,
} from '../../data/symmetry/symmetryCatalog';
import { SymmetryExerciseVisual } from './SymmetryExerciseVisual';
import { assetUrl } from '../../data/symmetry/assetHelper';

const MUSCLE_FILTERS: { key: string; label: string; muscleKey?: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'chest', label: 'Pecho', muscleKey: 'chest' },
  { key: 'back', label: 'Espalda', muscleKey: 'back' },
  { key: 'shoulders', label: 'Hombros', muscleKey: 'shoulders' },
  { key: 'biceps', label: 'Bíceps', muscleKey: 'biceps' },
  { key: 'triceps', label: 'Tríceps', muscleKey: 'triceps' },
  { key: 'quads', label: 'Cuádriceps', muscleKey: 'quads' },
  { key: 'hamstrings', label: 'Femorales', muscleKey: 'hamstrings' },
  { key: 'glutes', label: 'Glúteos', muscleKey: 'glutes' },
  { key: 'abs', label: 'Abdomen', muscleKey: 'abs' },
];

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
  const [selectedEquipment, setSelectedEquipment] = useState('all');

  const filteredExercises = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SYMMETRY_EXERCISES.filter((ex) => {
      const matchQuery =
        !q ||
        ex.name.toLowerCase().includes(q) ||
        (IMPLEMENT_LABELS[ex.implement] ?? ex.implement).toLowerCase().includes(q);
      const matchMuscle = selectedMuscle === 'all' || ex.primaryMuscle === selectedMuscle;
      const matchEquipment = selectedEquipment === 'all' || ex.implement === selectedEquipment;
      return matchQuery && matchMuscle && matchEquipment;
    });
  }, [query, selectedEquipment, selectedMuscle]);

  return (
    <div className="sym-modal-overlay" onClick={onClose}>
      <div className="sym-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="sym-modal-header">
          <h2 className="sym-modal-title">
            <img
              src={assetUrl('symmetry/icons/dumbell_icon.svg')}
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
            {MUSCLE_FILTERS.map((m) => {
              const isActive = selectedMuscle === m.key;
              const imgUrl = m.muscleKey ? getMuscleImage(m.muscleKey, isActive) : null;
              return (
                <button
                  key={m.key}
                  className={`sym-muscle-chip ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedMuscle(m.key)}
                  type="button"
                >
                  {imgUrl && (
                    <img
                      src={imgUrl}
                      alt=""
                      style={{
                        width: 22,
                        height: 22,
                        objectFit: 'contain',
                        borderRadius: 4,
                      }}
                    />
                  )}
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="sym-muscle-scroller" role="group" aria-label="Filtrar por equipamiento">
            {[
              { key: 'all', label: 'Todo el equipo' },
              ...Object.entries(IMPLEMENT_LABELS).map(([key, label]) => ({ key, label })),
            ].map((equipment) => (
              <button
                key={equipment.key}
                className={`sym-muscle-chip ${selectedEquipment === equipment.key ? 'active' : ''}`}
                onClick={() => setSelectedEquipment(equipment.key)}
                type="button"
                aria-pressed={selectedEquipment === equipment.key}
              >
                {equipment.label}
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
                const equipImg = getEquipmentImage(ex.implement);
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
                    <SymmetryExerciseVisual exercise={ex} variant="thumbnail" size={44} />
                    <div className="sym-picker-item-info">
                      <div className="sym-picker-item-name">{ex.name}</div>
                      <div className="sym-picker-item-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="sym-tag-pill">{implementLabel}</span>
                        {ex.loadDivisor === 2 && (
                          <span className="sym-tag-pill" style={{ color: '#60a5fa' }}>
                            Por mancuerna
                          </span>
                        )}
                        <img
                          src={equipImg}
                          alt=""
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          style={{ width: 16, height: 16, borderRadius: 3, objectFit: 'cover', opacity: 0.8 }}
                        />
                      </div>
                    </div>
                    <span style={{ color: 'var(--sym-blue)', fontSize: 20, fontWeight: 700 }}>+</span>
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
