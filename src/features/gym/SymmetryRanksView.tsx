import React, { useState, useMemo } from 'react';
import { SymmetryBodySilhouette } from './SymmetryBodySilhouette';
import {
  SYMMETRY_EXERCISES,
  calculateSymmetryRank,
  type SymmetryExercise,
} from '../../data/symmetry/symmetryCatalog';
import type { GymSession, SeedBestSet } from '../../data/db/models';

interface SymmetryRanksViewProps {
  gymSessions?: GymSession[];
  bestSets?: SeedBestSet[];
  userWeightKg?: number;
  onSelectExercise?: (exercise: SymmetryExercise) => void;
}

const MUSCLE_GROUPS: {
  id: string;
  name: string;
  drawerIcon: string;
  muscles: string[];
  sampleTier: string;
  color: string;
  sampleRatio: string;
}[] = [
  {
    id: 'arms',
    name: 'Brazos',
    drawerIcon: '/symmetry/icons/ranking/muscle_drawer/biceps.svg',
    muscles: ['biceps', 'triceps', 'forearms'],
    sampleTier: 'ORO I',
    color: '#f59e0b',
    sampleRatio: '3/3',
  },
  {
    id: 'legs',
    name: 'Piernas',
    drawerIcon: '/symmetry/icons/ranking/muscle_drawer/cuadriceps.svg',
    muscles: ['quads', 'hamstrings', 'calves', 'adductors', 'abductors'],
    sampleTier: 'ORO II',
    color: '#f59e0b',
    sampleRatio: '3/6',
  },
  {
    id: 'back',
    name: 'Espalda',
    drawerIcon: '/symmetry/icons/ranking/muscle_drawer/dorsales.svg',
    muscles: ['back', 'traps', 'lowerback'],
    sampleTier: 'RUBÍ II',
    color: '#ef4444',
    sampleRatio: '2/4',
  },
  {
    id: 'chest',
    name: 'Pecho',
    drawerIcon: '/symmetry/icons/ranking/muscle_drawer/pecho.svg',
    muscles: ['chest'],
    sampleTier: 'RUBÍ II',
    color: '#ef4444',
    sampleRatio: '1/2',
  },
  {
    id: 'shoulders',
    name: 'Hombros',
    drawerIcon: '/symmetry/icons/ranking/muscle_drawer/hombros.svg',
    muscles: ['shoulders'],
    sampleTier: 'RUBÍ III',
    color: '#ef4444',
    sampleRatio: '2/3',
  },
  {
    id: 'abs',
    name: 'Abdominales',
    drawerIcon: '/symmetry/icons/ranking/muscle_drawer/abdominales.svg',
    muscles: ['abs'],
    sampleTier: 'SIN RANGO',
    color: '#6b7280',
    sampleRatio: '0/2',
  },
  {
    id: 'neck',
    name: 'Cuello',
    drawerIcon: '/symmetry/icons/ranking/muscle_drawer/cuelo.svg',
    muscles: ['neck'],
    sampleTier: 'SIN RANGO',
    color: '#6b7280',
    sampleRatio: '0/1',
  },
];

export const SymmetryRanksView: React.FC<SymmetryRanksViewProps> = ({
  gymSessions: _gymSessions,
  bestSets: _bestSets,
  userWeightKg = 75,
  onSelectExercise,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'ranks' | 'calculator'>('ranks');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Calculator state
  const [calcExerciseId, setCalcExerciseId] = useState<number>(1);
  const [calcWeight, setCalcWeight] = useState<number>(80);
  const [calcReps, setCalcReps] = useState<number>(8);
  const [calcUserWeight, setCalcUserWeight] = useState<number>(userWeightKg || 75);

  const calculatedCalcRank = useMemo(() => {
    if (calcWeight <= 0 || calcUserWeight <= 0) return null;
    const oneRepMax = calcReps === 1 ? calcWeight : calcWeight * (1 + calcReps / 30);
    return calculateSymmetryRank(calcExerciseId, oneRepMax, calcUserWeight, 'male');
  }, [calcExerciseId, calcWeight, calcReps, calcUserWeight]);

  return (
    <div className="sym-ranks-screen" style={{ padding: '4px 0 32px' }}>
      {/* Top Header matching Screenshot 2 */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          padding: '0 4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="/symmetry/symmetry_letters_logo.svg"
            alt="Symmetry"
            style={{ height: 24, filter: 'brightness(0) invert(1)' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.5,
              background: 'linear-gradient(135deg, #2563eb, #60a5fa)',
              color: '#ffffff',
            }}
          >
            PRO
          </span>

          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#f97316',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            🔥 1
          </span>
        </div>
      </header>

      {/* Sub Tabs: Rangos | Calculadora */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #1f2127',
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveSubTab('ranks')}
          style={{
            flex: 1,
            padding: '12px 0',
            background: 'none',
            border: 'none',
            color: activeSubTab === 'ranks' ? '#ffffff' : '#717582',
            fontWeight: activeSubTab === 'ranks' ? 700 : 500,
            fontSize: 15,
            borderBottom: activeSubTab === 'ranks' ? '2px solid #ffffff' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          Rangos
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('calculator')}
          style={{
            flex: 1,
            padding: '12px 0',
            background: 'none',
            border: 'none',
            color: activeSubTab === 'calculator' ? '#ffffff' : '#717582',
            fontWeight: activeSubTab === 'calculator' ? 700 : 500,
            fontSize: 15,
            borderBottom: activeSubTab === 'calculator' ? '2px solid #ffffff' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          Calculadora
        </button>
      </div>

      {activeSubTab === 'ranks' ? (
        <>
          {/* MAIN HERO CARD (Screenshot 2) */}
          <div
            style={{
              position: 'relative',
              borderRadius: 20,
              padding: '18px 18px 22px',
              background: '#101115',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              boxShadow: '0 0 24px rgba(245, 158, 11, 0.12)',
              marginBottom: 24,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, letterSpacing: 0.5 }}>
                  RANGO SYMMETRY <span style={{ opacity: 0.6 }}>ⓘ</span>
                </div>
                <h2
                  style={{
                    fontSize: 32,
                    fontWeight: 900,
                    margin: '4px 0 2px',
                    color: '#f59e0b',
                    letterSpacing: 0.5,
                  }}
                >
                  ORO III
                </h2>
                <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>
                  Eres parte del top 35% más fuerte
                </div>
              </div>

              {/* Gold Wings Medal on top right */}
              <div style={{ width: 72, height: 72 }}>
                <img
                  src="/symmetry/icons/ranking/base/rank=gold.svg"
                  alt="Oro"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
            </div>

            {/* Center Front & Back Body Silhouette */}
            <div style={{ height: 280, margin: '14px 0 4px' }}>
              <SymmetryBodySilhouette view="dual" rankMode={true} height={280} />
            </div>
          </div>

          {/* RANKINGS MUSCULARES SECTION (Screenshot 2 & 6) */}
          <section>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: '#ffffff',
                marginBottom: 14,
                letterSpacing: '-0.2px',
              }}
            >
              Rankings Musculares
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {MUSCLE_GROUPS.map((mg) => {
                const isExpanded = expandedGroup === mg.id;
                const borderStyle =
                  mg.color === '#ef4444'
                    ? '1px solid rgba(239, 68, 68, 0.35)'
                    : mg.color === '#f59e0b'
                    ? '1px solid rgba(245, 158, 11, 0.35)'
                    : '1px solid rgba(255, 255, 255, 0.08)';

                return (
                  <div
                    key={mg.id}
                    style={{
                      borderRadius: 16,
                      background: '#121317',
                      border: borderStyle,
                      overflow: 'hidden',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedGroup(isExpanded ? null : mg.id)}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        background: 'none',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {/* Hexagon Muscle Badge */}
                        <div
                          style={{
                            position: 'relative',
                            width: 50,
                            height: 54,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <img
                            src="/symmetry/icons/ranking/muscle_group_hexagon_bg.svg"
                            alt=""
                            style={{ position: 'absolute', width: '100%', height: '100%' }}
                          />
                          <img
                            src={mg.drawerIcon}
                            alt={mg.name}
                            style={{
                              position: 'relative',
                              width: 36,
                              height: 36,
                              objectFit: 'contain',
                              filter:
                                mg.color === '#ef4444'
                                  ? 'drop-shadow(0 0 4px rgba(239,68,68,0.5))'
                                  : mg.color === '#f59e0b'
                                  ? 'drop-shadow(0 0 4px rgba(245,158,11,0.5))'
                                  : 'none',
                            }}
                          />
                        </div>

                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
                            {mg.name}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: mg.color, marginTop: 2 }}>
                            {mg.sampleTier} {mg.sampleRatio ? `· ${mg.sampleRatio}` : ''}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                          color: '#717582',
                          fontSize: 18,
                        }}
                      >
                        ∨
                      </div>
                    </button>

                    {/* Expanded Exercises */}
                    {isExpanded && (
                      <div
                        style={{
                          padding: '0 16px 16px',
                          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                          {SYMMETRY_EXERCISES.filter((ex) =>
                            mg.muscles.some((m) => ex.primaryMuscle.includes(m)),
                          )
                            .slice(0, 4)
                            .map((ex) => {
                              const rank = calculateSymmetryRank(ex.id, 0.01, userWeightKg, 'male');
                              const tierSvg = rank?.svg || '/symmetry/icons/ranking/rank=bronze1.svg';

                              return (
                                <div
                                  key={ex.id}
                                  onClick={() => onSelectExercise?.(ex)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 10px',
                                    borderRadius: 10,
                                    background: '#181a20',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>
                                      {ex.name}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                                      {ex.implement} · Sin marcas
                                    </div>
                                  </div>

                                  <div style={{ width: 28, height: 28 }}>
                                    <img src={tierSvg} alt="" style={{ width: '100%', height: '100%' }} />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        /* CALCULADORA TAB */
        <div style={{ background: '#121317', borderRadius: 20, padding: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', marginBottom: 16 }}>
            Calculadora de Rango
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>
                Ejercicio
              </label>
              <select
                value={calcExerciseId}
                onChange={(e) => setCalcExerciseId(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: '#1a1c22',
                  border: '1px solid #2a2d36',
                  color: '#ffffff',
                  fontSize: 14,
                }}
              >
                {SYMMETRY_EXERCISES.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>
                  Peso levantado (kg)
                </label>
                <input
                  type="number"
                  value={calcWeight}
                  onChange={(e) => setCalcWeight(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#1a1c22',
                    border: '1px solid #2a2d36',
                    color: '#ffffff',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>
                  Repeticiones
                </label>
                <input
                  type="number"
                  value={calcReps}
                  onChange={(e) => setCalcReps(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#1a1c22',
                    border: '1px solid #2a2d36',
                    color: '#ffffff',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>
                Tu peso corporal (kg)
              </label>
              <input
                type="number"
                value={calcUserWeight}
                onChange={(e) => setCalcUserWeight(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: '#1a1c22',
                  border: '1px solid #2a2d36',
                  color: '#ffffff',
                  fontSize: 15,
                  fontWeight: 700,
                }}
              />
            </div>

            {calculatedCalcRank && (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  borderRadius: 14,
                  background: '#1a1c24',
                  border: `1px solid ${calculatedCalcRank.color}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <div style={{ width: 54, height: 54 }}>
                  <img
                    src={calculatedCalcRank.svg}
                    alt={calculatedCalcRank.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: calculatedCalcRank.color }}>
                    {calculatedCalcRank.name}
                  </div>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
                    Ratio: {calculatedCalcRank.ratio.toFixed(2)}x peso corporal
                  </div>
                  <div style={{ fontSize: 12, color: '#60a5fa', marginTop: 2 }}>
                    Progreso: {calculatedCalcRank.progressPercent}% al siguiente nivel
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
