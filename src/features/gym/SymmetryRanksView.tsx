import React, { useEffect, useMemo, useState } from 'react';
import { SymmetryBodySilhouette } from './SymmetryBodySilhouette';
import {
  RANK_TIERS,
  SYMMETRY_EXERCISES,
  IMPLEMENT_LABELS,
  calculateSymmetryRank,
  type SymmetryExercise,
} from '../../data/symmetry/symmetryCatalog';
import type { Exercise, GymSession, SeedBestSet } from '../../data/db/models';
import { assetUrl } from '../../data/symmetry/assetHelper';
import { averageTierIndex, rankUps, userExerciseRanks, type ExerciseRank } from '../../data/symmetry/userRanks';
import { SymmetryIcon } from './components/SymmetryIcon';
import { LOTTIE, SymmetryLottie } from './components/SymmetryLottie';

interface SymmetryRanksViewProps {
  gymSessions?: GymSession[];
  bestSets?: SeedBestSet[];
  exercises?: Exercise[];
  userWeightKg?: number;
  streakWeeks?: number;
  onSelectExercise?: (exercise: SymmetryExercise) => void;
}

interface MuscleGroup {
  id: string;
  name: string;
  drawerIcon: string;
  /** primaryMuscle values of the Symmetry catalog. */
  muscles: string[];
  /** Keys understood by SymmetryBodySilhouette. */
  silhouette: string[];
}

const MUSCLE_GROUPS: MuscleGroup[] = [
  { id: 'chest', name: 'Pecho', drawerIcon: 'ranking/muscle_drawer/pecho', muscles: ['chest'], silhouette: ['chest'] },
  { id: 'back', name: 'Espalda', drawerIcon: 'ranking/muscle_drawer/dorsales', muscles: ['back'], silhouette: ['lat', 'trap'] },
  { id: 'shoulders', name: 'Hombros', drawerIcon: 'ranking/muscle_drawer/hombros', muscles: ['delts'], silhouette: ['shoulder'] },
  { id: 'arms', name: 'Brazos', drawerIcon: 'ranking/muscle_drawer/biceps', muscles: ['biceps', 'triceps'], silhouette: ['biceps', 'tricep'] },
  { id: 'legs', name: 'Piernas', drawerIcon: 'ranking/muscle_drawer/cuadriceps', muscles: ['quads', 'hamstrings', 'glutes', 'calves'], silhouette: ['quad', 'hamstring', 'glute'] },
  { id: 'abs', name: 'Abdominales', drawerIcon: 'ranking/muscle_drawer/abdominales', muscles: ['abs'], silhouette: ['abs'] },
];

const UNRANKED = { name: 'Sin rango', color: '#6b7280', base: 'iron' };
const SEEN_KEY = 'fitplan.symmetry.seenRanks';

function tierInfo(index: number | null) {
  if (index === null || index < 0) return UNRANKED;
  const tier = RANK_TIERS[Math.min(index, RANK_TIERS.length - 1)]!;
  return { name: tier.name, color: tier.color, base: tier.id.replace(/\d+$/, '') };
}

function readSeen(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : null;
  } catch {
    return null;
  }
}

function writeSeen(ranks: ReadonlyArray<ExerciseRank>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(ranks.map((r) => [r.exercise.id, r.tierIndex]))));
  } catch {
    // Private mode: the rank-up animation simply won't be remembered.
  }
}

const kgFmt = (v: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(v);

export const SymmetryRanksView: React.FC<SymmetryRanksViewProps> = ({
  gymSessions = [],
  bestSets = [],
  exercises = [],
  userWeightKg = 75,
  streakWeeks = 0,
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

  const ranks = useMemo(
    () => userExerciseRanks(gymSessions, bestSets, exercises, userWeightKg),
    [gymSessions, bestSets, exercises, userWeightKg],
  );
  const overall = tierInfo(averageTierIndex(ranks));

  const groups = useMemo(
    () =>
      MUSCLE_GROUPS.map((g) => {
        const groupRanks = ranks.filter((r) => g.muscles.includes(r.exercise.primaryMuscle));
        const rankedIds = new Set(groupRanks.map((r) => r.exercise.id));
        const others = SYMMETRY_EXERCISES.filter(
          (e) => e.rankThresholds && g.muscles.includes(e.primaryMuscle) && !rankedIds.has(e.id),
        );
        return { ...g, ranks: groupRanks, others, tier: tierInfo(averageTierIndex(groupRanks)) };
      }),
    [ranks],
  );

  const trainedSilhouette = groups.filter((g) => g.ranks.length > 0).flatMap((g) => g.silhouette);

  // Rank-up celebration: compare with the last snapshot seen on this device.
  const [celebrate, setCelebrate] = useState<ExerciseRank | null>(null);
  useEffect(() => {
    const seen = readSeen();
    if (seen === null) {
      writeSeen(ranks);
      return;
    }
    const ups = rankUps(ranks, seen);
    if (ups.length > 0) setCelebrate(ups.sort((a, b) => b.tierIndex - a.tierIndex)[0]!);
    else writeSeen(ranks);
  }, [ranks]);

  const dismissCelebration = () => {
    writeSeen(ranks);
    setCelebrate(null);
  };

  return (
    <div className="sym-ranks-screen" style={{ padding: '4px 0 32px' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          padding: '0 4px',
        }}
      >
        <img
          src={assetUrl('symmetry/symmetry_letters_logo.svg')}
          alt="Symmetry"
          style={{ height: 24, filter: 'brightness(0) invert(1)' }}
        />
        <span
          title={`${streakWeeks} semanas seguidas entrenando`}
          style={{ fontSize: 14, fontWeight: 700, color: '#f97316', display: 'flex', alignItems: 'center', gap: 2 }}
        >
          <SymmetryLottie
            src={LOTTIE.streakFlame}
            size={26}
            fallback={<SymmetryIcon name={streakWeeks > 0 ? 'streak/flame_lit' : 'streak/flame_grey'} mode="original" size={18} />}
          />
          {streakWeeks}
        </span>
      </header>

      {/* Sub Tabs: Rangos | Calculadora */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #1f2127',
          marginBottom: 16,
        }}
      >
        {(['ranks', 'calculator'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveSubTab(tab)}
            style={{
              flex: 1,
              padding: '12px 0',
              background: 'none',
              border: 'none',
              color: activeSubTab === tab ? '#ffffff' : '#717582',
              fontWeight: activeSubTab === tab ? 700 : 500,
              fontSize: 15,
              borderBottom: activeSubTab === tab ? '2px solid #ffffff' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {tab === 'ranks' ? 'Rangos' : 'Calculadora'}
          </button>
        ))}
      </div>

      {activeSubTab === 'ranks' ? (
        <>
          {/* Overall rank card */}
          <div
            style={{
              position: 'relative',
              borderRadius: 20,
              padding: '18px 18px 22px',
              background: '#101115',
              border: `1px solid ${overall.color}66`,
              boxShadow: `0 0 24px ${overall.color}1f`,
              marginBottom: 24,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, letterSpacing: 0.5 }}>RANGO SYMMETRY</div>
                <h2
                  style={{
                    fontSize: 32,
                    fontWeight: 900,
                    margin: '4px 0 2px',
                    color: overall.color,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  {overall.name}
                </h2>
                <div style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600 }}>
                  {ranks.length > 0
                    ? `Media de ${ranks.length} ejercicio${ranks.length === 1 ? '' : 's'} con marca · ${kgFmt(userWeightKg)} kg corporales`
                    : 'Registra series de ejercicios del catálogo para obtener rango'}
                </div>
              </div>

              <SymmetryIcon name={`ranking/base/rank=${overall.base}`} mode="original" size={72} title={overall.name} />
            </div>

            <div style={{ height: 280, margin: '14px 0 4px' }}>
              <SymmetryBodySilhouette view="dual" highlightedMuscles={trainedSilhouette} highlightColor={overall.color} height={280} />
            </div>
          </div>

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
              {groups.map((mg) => {
                const isExpanded = expandedGroup === mg.id;
                const ranked = mg.ranks.length > 0;
                return (
                  <div
                    key={mg.id}
                    style={{
                      borderRadius: 16,
                      background: '#121317',
                      border: ranked ? `1px solid ${mg.tier.color}59` : '1px solid rgba(255, 255, 255, 0.08)',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      type="button"
                      aria-expanded={isExpanded}
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
                        <div style={{ position: 'relative', width: 50, height: 54, display: 'grid', placeItems: 'center' }}>
                          <SymmetryIcon
                            name="ranking/muscle_group_hexagon_bg"
                            mode="original"
                            size={54}
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                          />
                          <SymmetryIcon
                            name={mg.drawerIcon}
                            mode="original"
                            size={36}
                            title={mg.name}
                            style={{ position: 'relative', filter: ranked ? `drop-shadow(0 0 4px ${mg.tier.color}80)` : undefined }}
                          />
                        </div>

                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff' }}>{mg.name}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: mg.tier.color, marginTop: 2, textTransform: 'uppercase' }}>
                            {mg.tier.name} · {mg.ranks.length}/{mg.ranks.length + mg.others.length}
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

                    {isExpanded && (
                      <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                          {mg.ranks.map((r) => (
                            <RankRow
                              key={r.exercise.id}
                              exercise={r.exercise}
                              detail={`${kgFmt(r.weightKg)} kg × ${r.reps} · 1RM ${kgFmt(r.e1rm)} kg · ${r.rank.ratio.toFixed(2)}x`}
                              tierName={r.tierIndex < 0 ? 'Sin rango' : r.rank.name}
                              tierColor={r.tierIndex < 0 ? UNRANKED.color : r.rank.color}
                              tierSvg={r.tierIndex < 0 ? null : r.rank.svg}
                              progress={r.rank.nextThreshold !== null ? r.rank.progressPercent : null}
                              onClick={() => onSelectExercise?.(r.exercise)}
                            />
                          ))}
                          {mg.others.slice(0, 6).map((ex) => (
                            <RankRow
                              key={ex.id}
                              exercise={ex}
                              detail={`${IMPLEMENT_LABELS[ex.implement] ?? ex.implement} · Sin marcas`}
                              tierName={null}
                              tierColor={UNRANKED.color}
                              tierSvg={null}
                              progress={null}
                              onClick={() => onSelectExercise?.(ex)}
                            />
                          ))}
                          {mg.others.length > 6 && (
                            <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'center' }}>
                              +{mg.others.length - 6} ejercicios más en la Biblioteca
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {celebrate && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Subida de rango"
              onClick={dismissCelebration}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1100,
                background: 'rgba(0,0,0,0.88)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                textAlign: 'center',
              }}
            >
              <div style={{ position: 'relative', width: 220, height: 220 }}>
                <SymmetryLottie src={LOTTIE.rankUp} size={220} loop={false} style={{ position: 'absolute', inset: 0 }} />
                <img
                  src={celebrate.rank.svg}
                  alt=""
                  style={{ position: 'absolute', inset: 50, width: 120, height: 120, objectFit: 'contain' }}
                />
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af', fontWeight: 700, letterSpacing: 1, marginTop: 8 }}>¡SUBISTE DE RANGO!</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: celebrate.rank.color, textTransform: 'uppercase' }}>
                {celebrate.rank.name}
              </div>
              <div style={{ fontSize: 14, color: '#ffffff', marginTop: 6 }}>{celebrate.exercise.name}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                {kgFmt(celebrate.weightKg)} kg × {celebrate.reps} · {celebrate.rank.ratio.toFixed(2)}x tu peso
              </div>
              <button
                type="button"
                onClick={dismissCelebration}
                style={{
                  marginTop: 24,
                  padding: '12px 32px',
                  borderRadius: 14,
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: 'pointer',
                }}
              >
                Continuar
              </button>
            </div>
          )}
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

function RankRow({
  exercise,
  detail,
  tierName,
  tierColor,
  tierSvg,
  progress,
  onClick,
}: {
  exercise: SymmetryExercise;
  detail: string;
  tierName: string | null;
  tierColor: string;
  tierSvg: string | null;
  progress: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 10,
        background: '#181a20',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>{exercise.name}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{detail}</div>
        {tierName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: tierColor }}>{tierName}</span>
            {progress !== null && (
              <span style={{ flex: 1, maxWidth: 90, height: 4, borderRadius: 2, background: '#262932', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${progress}%`, height: '100%', background: tierColor }} />
              </span>
            )}
          </div>
        )}
      </div>
      <div style={{ width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        {tierSvg ? (
          <img src={tierSvg} alt="" style={{ width: '100%', height: '100%' }} />
        ) : (
          <span style={{ color: '#4b5563', fontSize: 16 }}>›</span>
        )}
      </div>
    </button>
  );
}
