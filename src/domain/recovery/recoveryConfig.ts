// Recovery thresholds (spec section 5). Editable in Ajustes; stored per user and synced.

export interface RecoveryConfig {
  /** HRV: z-score of the 7-day mean of ln(SDNN) against the 28-day baseline. */
  hrvZYellow: number; // z < this → yellow
  hrvZRed: number; // z < this → red
  hrvMin7: number; // readings needed in the 7-day window
  hrvMin28: number; // readings needed in the 28-day window
  /** Resting HR: today minus the mean of the previous 28 days. */
  rhrDeltaYellow: number; // ≥ → yellow
  rhrDeltaRed: number; // ≥ → red
  rhrMin28: number;
  /** Sleep (hours). */
  sleepRed: number; // < → red
  sleepYellow: number; // < → yellow
  sleepBelowMeanYellow: number; // < mean14 − this → yellow
  sleepMin14: number; // nights needed for the relative rule
  /** Respiratory rate: ≥ mean28 + this → yellow. */
  respDeltaYellow: number;
  /** Wrist temperature: ≥ mean28 + this (°C) → yellow. */
  wristTempDeltaYellow: number;
  /** Acute:chronic workload ratio: > this → yellow. */
  acwrYellow: number;
  /** Number of simultaneous yellow conditions that turn the day red. */
  yellowCountRed: number;
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  hrvZYellow: -0.5,
  hrvZRed: -1.5,
  hrvMin7: 3,
  hrvMin28: 10,
  rhrDeltaYellow: 4,
  rhrDeltaRed: 7,
  rhrMin28: 10,
  sleepRed: 5,
  sleepYellow: 6.5,
  sleepBelowMeanYellow: 1,
  sleepMin14: 7,
  respDeltaYellow: 2,
  wristTempDeltaYellow: 0.5,
  acwrYellow: 1.5,
  yellowCountRed: 2,
};
