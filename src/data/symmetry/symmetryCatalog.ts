import symmetryExercises from './symmetryCatalog.json';
import type { Muscle } from '../../domain/strength/strength';
import { assetUrl } from './assetHelper';

export interface SymmetryExercise {
  id: number;
  name: string;
  implement: 'barbell' | 'dumbbell' | 'machine' | 'smith' | 'cable' | 'bodyweight' | string;
  category: 'push' | 'pull' | 'legs';
  primaryMuscle: Muscle;
  loggedUnit: string;
  loadDivisor: number;
  rankThresholds: {
    male: number[];
    female: number[];
  } | null;
}

export const SYMMETRY_EXERCISES: SymmetryExercise[] = symmetryExercises as SymmetryExercise[];

export const RANK_TIERS = [
  { id: 'iron1', name: 'Hierro I', color: '#6b7280', svg: assetUrl('symmetry/icons/ranking/rank=iron1.svg') },
  { id: 'iron2', name: 'Hierro II', color: '#6b7280', svg: assetUrl('symmetry/icons/ranking/rank=iron2.svg') },
  { id: 'iron3', name: 'Hierro III', color: '#6b7280', svg: assetUrl('symmetry/icons/ranking/rank=iron3.svg') },
  { id: 'bronze1', name: 'Bronce I', color: '#b45309', svg: assetUrl('symmetry/icons/ranking/rank=bronze1.svg') },
  { id: 'bronze2', name: 'Bronce II', color: '#b45309', svg: assetUrl('symmetry/icons/ranking/rank=bronze2.svg') },
  { id: 'bronze3', name: 'Bronce III', color: '#b45309', svg: assetUrl('symmetry/icons/ranking/rank=bronze3.svg') },
  { id: 'silver1', name: 'Plata I', color: '#9ca3af', svg: assetUrl('symmetry/icons/ranking/rank=silver1.svg') },
  { id: 'silver2', name: 'Plata II', color: '#9ca3af', svg: assetUrl('symmetry/icons/ranking/rank=silver2.svg') },
  { id: 'silver3', name: 'Plata III', color: '#9ca3af', svg: assetUrl('symmetry/icons/ranking/rank=silver3.svg') },
  { id: 'gold1', name: 'Oro I', color: '#f59e0b', svg: assetUrl('symmetry/icons/ranking/rank=gold1.svg') },
  { id: 'gold2', name: 'Oro II', color: '#f59e0b', svg: assetUrl('symmetry/icons/ranking/rank=gold2.svg') },
  { id: 'gold3', name: 'Oro III', color: '#f59e0b', svg: assetUrl('symmetry/icons/ranking/rank=gold3.svg') },
  { id: 'emerald1', name: 'Esmeralda I', color: '#10b981', svg: assetUrl('symmetry/icons/ranking/rank=emerald1.svg') },
  { id: 'emerald2', name: 'Esmeralda II', color: '#10b981', svg: assetUrl('symmetry/icons/ranking/rank=emerald2.svg') },
  { id: 'emerald3', name: 'Esmeralda III', color: '#10b981', svg: assetUrl('symmetry/icons/ranking/rank=emerald3.svg') },
  { id: 'ruby1', name: 'Rubí I', color: '#ef4444', svg: assetUrl('symmetry/icons/ranking/rank=ruby1.svg') },
  { id: 'ruby2', name: 'Rubí II', color: '#ef4444', svg: assetUrl('symmetry/icons/ranking/rank=ruby2.svg') },
  { id: 'ruby3', name: 'Rubí III', color: '#ef4444', svg: assetUrl('symmetry/icons/ranking/rank=ruby3.svg') },
  { id: 'diamond1', name: 'Diamante I', color: '#06b6d4', svg: assetUrl('symmetry/icons/ranking/rank=diamond1.svg') },
  { id: 'diamond2', name: 'Diamante II', color: '#06b6d4', svg: assetUrl('symmetry/icons/ranking/rank=diamond2.svg') },
  { id: 'diamond3', name: 'Diamante III', color: '#06b6d4', svg: assetUrl('symmetry/icons/ranking/rank=diamond3.svg') },
  { id: 'champion', name: 'Campeón I', color: '#8b5cf6', svg: assetUrl('symmetry/icons/ranking/rank=champion.svg') },
  { id: 'champion2', name: 'Campeón II', color: '#8b5cf6', svg: assetUrl('symmetry/icons/ranking/rank=champion2.svg') },
  { id: 'champion3', name: 'Campeón III', color: '#8b5cf6', svg: assetUrl('symmetry/icons/ranking/rank=champion3.svg') },
  { id: 'symmetric', name: 'Simétrico', color: '#ec4899', svg: assetUrl('symmetry/icons/ranking/rank=symmetric.svg') },
] as const;

export type RankTierId = (typeof RANK_TIERS)[number]['id'];

export interface CalculatedRank {
  tierId: RankTierId;
  name: string;
  color: string;
  svg: string;
  ratio: number;
  currentThreshold: number;
  nextThreshold: number | null;
  progressPercent: number;
}

export function findSymmetryExercise(idOrName: number | string): SymmetryExercise | undefined {
  if (typeof idOrName === 'number') {
    return SYMMETRY_EXERCISES.find((e) => e.id === idOrName);
  }
  const clean = idOrName.trim().toLowerCase();
  return (
    SYMMETRY_EXERCISES.find((e) => e.name.toLowerCase() === clean) ||
    SYMMETRY_EXERCISES.find((e) => e.name.toLowerCase().includes(clean))
  );
}

export function calculateSymmetryRank(
  exerciseId: number,
  oneRepMaxKg: number,
  userWeightKg: number,
  gender: 'male' | 'female' = 'male',
): CalculatedRank | null {
  const exercise = findSymmetryExercise(exerciseId);
  if (!exercise || !exercise.rankThresholds || userWeightKg <= 0 || oneRepMaxKg <= 0) return null;

  const thresholds = exercise.rankThresholds[gender] || exercise.rankThresholds.male;
  if (!thresholds || thresholds.length === 0) return null;

  const ratio = oneRepMaxKg / userWeightKg;

  let achievedIndex = -1;
  for (let i = 0; i < thresholds.length; i++) {
    const val = thresholds[i];
    if (val !== undefined && ratio >= val) {
      achievedIndex = i;
    } else {
      break;
    }
  }

  if (achievedIndex < 0) {
    // Below Iron 1
    const nextThresh = thresholds[0] ?? 0.5;
    return {
      tierId: 'iron1',
      name: 'Sin rango (pronto Hierro I)',
      color: '#4b5563',
      svg: assetUrl('symmetry/icons/ranking/rank=iron1.svg'),
      ratio,
      currentThreshold: 0,
      nextThreshold: nextThresh,
      progressPercent: Math.min(100, Math.round((ratio / nextThresh) * 100)),
    };
  }

  const safeTierIndex = Math.min(achievedIndex, RANK_TIERS.length - 1);
  const tier = RANK_TIERS[safeTierIndex] ?? RANK_TIERS[0];
  const currentThreshold = thresholds[achievedIndex] ?? 0;
  const nextVal = achievedIndex + 1 < thresholds.length ? thresholds[achievedIndex + 1] : null;
  const nextThreshold = nextVal ?? null;

  const progressPercent = nextThreshold !== null
    ? Math.min(100, Math.max(0, Math.round(((ratio - currentThreshold) / (nextThreshold - currentThreshold)) * 100)))
    : 100;

  return {
    tierId: tier.id,
    name: tier.name,
    color: tier.color,
    svg: tier.svg,
    ratio,
    currentThreshold,
    nextThreshold,
    progressPercent,
  };
}

export const IMPLEMENT_LABELS: Record<string, string> = {
  barbell: 'Barra',
  dumbbell: 'Mancuerna',
  machine: 'Máquina',
  smith: 'Máquina Smith',
  cable: 'Polea',
  bodyweight: 'Peso Corporal',
};

export function getMuscleImage(muscle: string, selected = false): string {
  const suffix = selected ? '_selected.png' : '.png';
  const map: Record<string, string> = {
    chest: 'image_chest',
    back: 'image_lats',
    shoulders: 'image_shoulders',
    biceps: 'image_biceps',
    triceps: 'image_triceps',
    forearms: 'image_forearms',
    quads: 'image_quads',
    hamstrings: 'image_hamstrings',
    glutes: 'image_glutes',
    calves: 'image_calves',
    abs: 'image_abs',
    traps: 'image_trapezoids',
    neck: 'image_neck',
    adductors: 'image_adductors',
    abductors: 'image_abductors',
    lowerback: 'image_lowerback',
  };
  const key = map[muscle] || 'image_chest';
  return assetUrl(`symmetry/images/shared/${key}${suffix}`);
}

export function getEquipmentImage(equipment: string): string {
  const map: Record<string, string> = {
    dumbbell: assetUrl('symmetry/images/equipment/img-dumbbells.jpg'),
    barbell: assetUrl('symmetry/images/equipment/img-barbells.jpg'),
    smith: assetUrl('symmetry/images/equipment/img-smith-machine.jpg'),
    cable: assetUrl('symmetry/images/equipment/img-crossover-cable.jpg'),
    machine: assetUrl('symmetry/images/equipment/img-commercial-gym-machines.jpg'),
    bodyweight: assetUrl('symmetry/images/equipment/img-no-equipment.jpg'),
  };
  return map[equipment] || assetUrl('symmetry/images/equipment/img-dumbbells.jpg');
}

