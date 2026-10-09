import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppData';
import { addDays, dateKey, formatDuration } from '../../domain/dates';
import { movingAverage, seriesWithBaseline } from '../../domain/health/baselineSeries';
import { StrengthSection } from './StrengthSection';
import { TrendChart } from './TrendChart';

const RANGES = [
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
  { days: 365, label: '1 año' },
] as const;

const int = new Intl.NumberFormat('es-ES');
const dec1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

export function ProgressView() {
  const { days, profile, recoveryConfig, timeZone } = useAppData();
  const [range, setRange] = useState<number>(30);
  const to = dateKey(Date.now(), timeZone);
  const from = addDays(to, -(range - 1));

  const charts = useMemo(() => {
    const cfg = recoveryConfig;
    const hrv = seriesWithBaseline(days, 'hrvSDNN', from, to, { window: 28, minCount: cfg.hrvMin28, logScale: true });
    const rhr = seriesWithBaseline(days, 'restingHR', from, to, { window: 28, minCount: cfg.rhrMin28 });
    const sleep = seriesWithBaseline(days, 'sleepHours', from, to, { window: 14, minCount: cfg.sleepMin14 });
    const steps = seriesWithBaseline(days, 'steps', from, to, { window: 28, minCount: Infinity });
    const weight = seriesWithBaseline(days, 'bodyMassKg', from, to, { window: 28, minCount: Infinity });
    return { hrv, rhr, sleep, steps, weight, weightTrend: movingAverage(weight, 7) };
  }, [days, from, to, recoveryConfig]);

  const stepsDays = charts.steps.filter((p) => p.value !== undefined);
  const goal = profile?.stepGoal ?? 10000;
  const goalDays = stepsDays.filter((p) => p.value! >= goal).length;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Progreso</h1>
      </header>

      <div className="range-tabs" role="group" aria-label="Periodo">
        {RANGES.map((r) => (
          <button key={r.days} aria-pressed={range === r.days} onClick={() => setRange(r.days)}>
            {r.label}
          </button>
        ))}
      </div>

      <StrengthSection />

      <TrendChart
        title="VFC (SDNN)"
        kind="line"
        points={charts.hrv}
        format={(v) => `${Math.round(v)} ms`}
        baselineLabel="Línea base 28 d"
      />
      <TrendChart
        title="Pulso en reposo"
        kind="line"
        points={charts.rhr}
        format={(v) => `${Math.round(v)} lpm`}
        baselineLabel="Línea base 28 d"
      />
      <TrendChart
        title="Sueño"
        kind="line"
        points={charts.sleep}
        format={(v) => formatDuration(v)}
        baselineLabel="Media 14 d"
      />
      <TrendChart
        title="Pasos"
        kind="bar"
        points={charts.steps}
        format={(v) => (v >= 1000 ? `${dec1.format(v / 1000)} k` : int.format(v))}
        formatExact={(v) => `${int.format(v)} pasos`}
        goal={{ value: goal, label: `Objetivo ${int.format(goal)}` }}
      />
      {stepsDays.length > 0 && (
        <p className="metric-hint" style={{ marginTop: -6, marginBottom: 14 }}>
          {goalDays} de {stepsDays.length} días con {int.format(goal)} pasos o más (
          {Math.round((goalDays / stepsDays.length) * 100)} %).
        </p>
      )}
      <TrendChart
        title="Peso"
        kind="line"
        points={charts.weight}
        trend={charts.weightTrend}
        trendLabel="Media de 7 días"
        format={(v) => `${dec1.format(v)} kg`}
      />
    </div>
  );
}
