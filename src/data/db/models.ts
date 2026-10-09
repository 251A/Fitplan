// Persisted records (spec section 3, adapted to IndexedDB).

import type { DateKey } from '../../domain/dates';
import type { DailyHealth } from '../../domain/health/dailyMetrics';
import type { Equipment, LoadMode, Muscle } from '../../domain/strength/strength';
import type { WorkoutKind } from '../health/payload';

/** `unconfirmed` loadMode = ask the user the first time it appears (spec 10, "por confirmar"). */
export type { Equipment, LoadMode, Muscle };

export interface Exercise {
  id: string;
  name: string;
  aliases: string[];
  primaryMuscle: Muscle;
  secondaryMuscles: Muscle[];
  equipment: Equipment;
  loadMode: LoadMode;
  category: 'push' | 'pull' | 'legs';
  /** Symmetry logs the pair of dumbbells for this exercise (remembered so the import halves it). */
  symmetryLogsPair?: boolean;
}

export interface SetEntry {
  exerciseId: string;
  order: number;
  /** Normalised: per dumbbell when loadMode = perDumbbell. */
  weightKg: number;
  reps: number;
  rir?: number;
  skipped: boolean;
}

export type GymSource = 'symmetry' | 'hevy' | 'app' | 'health' | 'seed';

export interface GymSession {
  id: string;
  date: DateKey | null;
  templateName: string;
  source: GymSource;
  durationMin?: number;
  healthWorkoutId?: string;
  sets: SetEntry[];
  note?: string;
  /** True when only the summary is known (no sets). */
  summaryOnly: boolean;
  /** Totals shown on the Symmetry header, kept to cross-check the imported sets. */
  header?: { volumeKg?: number; setsTotal?: number };
  /** Import cross-check failed or something is still to confirm. */
  needsReview?: boolean;
  createdAt?: number;
}

/** Best recent set per exercise from the seed (used for "último peso" from day one). */
export interface SeedBestSet {
  id: string;
  exerciseId: string;
  date?: DateKey;
  weightKg: number;
  reps: number;
}

export interface HealthWorkout {
  /** `${startMs}-${source}`: stable across re-imports, so syncing twice never duplicates. */
  id: string;
  startMs: number;
  endMs: number;
  kind: WorkoutKind;
  rawType: string;
  source?: string;
  durationMin: number;
  distanceM?: number;
  energyKcal?: number;
  avgHR?: number;
  maxHR?: number;
}

export type ThreeDayTemplate = 'upperLowerFull' | 'pushPullLegs';

export interface UserProfile {
  heightCm: number;
  startWeightKg: number;
  startWeightDate: DateKey;
  hrMaxObserved: number;
  stepGoal: number;
  gymBaseDays: number;
  threeDayTemplate: ThreeDayTemplate;
}

export type DailyHealthRecord = DailyHealth;

export interface SyncInfo {
  lastSyncMs: number;
  generatedAtMs?: number;
  daysUpdated: number;
  workoutsAdded: number;
  warnings: string[];
}
