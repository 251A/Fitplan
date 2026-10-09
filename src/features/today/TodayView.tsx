import { useAppData } from '../../app/AppData';
import { dateKey, formatDuration } from '../../domain/dates';
import { mean, previousValues } from '../../domain/health/baseline';
import type { DailyHealth } from '../../domain/health/dailyMetrics';
import { HealthSyncCard } from './HealthSyncCard';

const longDate = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const int = new Intl.NumberFormat('es-ES');
const dec1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

function Metric(props: { label: string; value?: string; hint?: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="metric">
      <div className="metric-label">{props.label}</div>
      <div className={`metric-value ${props.tone ?? ''}`}>{props.value ?? '—'}</div>
      {props.hint && <div className="metric-hint">{props.hint}</div>}
    </div>
  );
}

function diffHint(today: number | undefined, avg: number | undefined, unit: string, digits = 0): string | undefined {
  if (today === undefined || avg === undefined) return undefined;
  const diff = today - avg;
  const fmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits, signDisplay: 'always' });
  return `${fmt.format(diff)} ${unit} vs media 28 d`;
}

export function TodayView() {
  const { days, profile, workouts, timeZone } = useAppData();
  const todayKey = dateKey(Date.now(), timeZone);
  const today: DailyHealth = days.find((d) => d.date === todayKey) ?? { date: todayKey };
  const stepGoal = profile?.stepGoal ?? 10000;
  const steps = today.steps ?? 0;
  const stepPct = Math.min(1, steps / stepGoal);

  const hrvAvg = mean(previousValues(days, 'hrvSDNN', todayKey, 28));
  const rhrAvg = mean(previousValues(days, 'restingHR', todayKey, 28));
  const sleepAvg = mean(previousValues(days, 'sleepHours', todayKey, 14));

  const recent = workouts.slice(-3).reverse();
  const kindLabel = { run: 'Carrera', swim: 'Natación', walk: 'Caminata', strength: 'Fuerza', other: 'Entreno' };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Hoy</h1>
        <p className="subtitle">{longDate.format(new Date())}</p>
      </header>

      <HealthSyncCard />

      <section className="card">
        <h2>Pasos</h2>
        <div className="steps-row">
          <span className="steps-value">{int.format(steps)}</span>
          <span className="steps-goal">/ {int.format(stepGoal)}</span>
        </div>
        <div className="bar" role="progressbar" aria-valuenow={steps} aria-valuemax={stepGoal}>
          <div className={`bar-fill ${stepPct >= 1 ? 'done' : ''}`} style={{ width: `${stepPct * 100}%` }} />
        </div>
        <p className="metric-hint">
          {steps >= stepGoal
            ? 'Objetivo cumplido.'
            : `Faltan ${int.format(stepGoal - steps)} pasos (según la última sincronización).`}
        </p>
      </section>

      <section className="card">
        <h2>Recuperación</h2>
        <p className="metric-hint">El semáforo llega en la fase 2. De momento, los valores de anoche:</p>
        <div className="metric-grid">
          <Metric
            label="Sueño"
            value={today.sleepHours !== undefined ? formatDuration(today.sleepHours) : undefined}
            hint={
              today.sleepHours !== undefined && sleepAvg !== undefined
                ? `Media 14 d: ${formatDuration(sleepAvg)}`
                : undefined
            }
          />
          <Metric
            label="VFC (SDNN)"
            value={today.hrvSDNN !== undefined ? `${dec1.format(today.hrvSDNN)} ms` : undefined}
            hint={diffHint(today.hrvSDNN, hrvAvg, 'ms') ?? (today.hrvFromNight === false ? 'Lecturas de día' : undefined)}
          />
          <Metric
            label="Pulso en reposo"
            value={today.restingHR !== undefined ? `${today.restingHR} lpm` : undefined}
            hint={diffHint(today.restingHR, rhrAvg, 'lpm')}
          />
          <Metric
            label="Peso"
            value={today.bodyMassKg !== undefined ? `${dec1.format(today.bodyMassKg)} kg` : undefined}
          />
        </div>
      </section>

      <section className="card">
        <h2>Sesión de hoy</h2>
        <p className="metric-hint">El planificador semanal llega en la fase 4.</p>
      </section>

      {recent.length > 0 && (
        <section className="card">
          <h2>Últimos entrenos (Salud)</h2>
          <ul className="list">
            {recent.map((w) => (
              <li key={w.id}>
                <span>
                  {kindLabel[w.kind]} · {new Date(w.startMs).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </span>
                <span className="muted">
                  {Math.round(w.durationMin)} min
                  {w.distanceM ? ` · ${dec1.format(w.distanceM / 1000)} km` : ''}
                  {w.source ? ` · ${w.source}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
