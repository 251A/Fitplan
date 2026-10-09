import { useMemo } from 'react';
import { useAppData } from '../../app/AppData';
import { dateKey } from '../../domain/dates';
import { acwr, dailyLoads } from '../../domain/load/trainingLoad';
import { evaluateRecovery, type RecoveryResult } from '../../domain/recovery/recoveryEngine';

/** Recovery state for a day (today by default), including training-load ACWR from Health workouts. */
export function useRecovery(date?: string): RecoveryResult {
  const { days, workouts, profile, recoveryConfig, timeZone } = useAppData();
  const key = date ?? dateKey(Date.now(), timeZone);

  return useMemo(() => {
    const hrMax = profile?.hrMaxObserved || undefined;
    const loads = dailyLoads(workouts, hrMax, timeZone);
    const first = workouts.length > 0 ? dateKey(workouts[0]!.startMs, timeZone) : undefined;
    return evaluateRecovery(days, key, { config: recoveryConfig, acwr: acwr(loads, key, first) });
  }, [days, workouts, profile, recoveryConfig, timeZone, key]);
}
