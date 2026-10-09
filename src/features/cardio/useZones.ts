import { useMemo } from 'react';
import { useAppData } from '../../app/AppData';
import { dateKey } from '../../domain/dates';
import { karvonenZones } from '../../domain/cardioPlans/heartRateZones';
import { mean, previousValues } from '../../domain/health/baseline';

/** Karvonen zones from the observed HR max and the 28-day mean resting HR (spec 8). */
export function useZones() {
  const { profile, days, timeZone } = useAppData();
  return useMemo(() => {
    const today = dateKey(Date.now(), timeZone);
    const restMean = mean(previousValues(days, 'restingHR', today, 28));
    const hrMax = profile?.hrMaxObserved || undefined;
    const rest = restMean !== undefined ? Math.round(restMean) : undefined;
    if (!hrMax) return { ready: false as const, reason: 'Pon tu FC máxima observada en Ajustes para calcular tus zonas.' };
    const zones = karvonenZones(hrMax, rest ?? 62);
    return { ready: true as const, zones, z2: zones[1]!, z3: zones[2]!, hrMax, rest, restEstimated: rest === undefined };
  }, [profile, days, timeZone]);
}
