import { useMemo } from 'react';
import { useAppData } from '../../app/AppData';
import { addDays, dateKey } from '../../domain/dates';
import {
  e1rmHistory,
  isStagnant,
  MUSCLE_LABEL,
  relativeStrengthWarning,
  volumeWarnings,
  weeklyBest,
  weeklySetsPerMuscle,
  weekStart,
  type ExerciseInfo,
} from '../../domain/strength/strength';
import { kg, sessionsWithSeed } from '../gym/gymStats';

/** The basics the spec prioritises (section 6, step 1). */
const BASICS = ['bench-press-barbell', 'incline-press-smith', 'lat-pulldown-pronated', 'row-neutral-machine', 'leg-press-45', 'lying-leg-curl-db'];

const pct = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, signDisplay: 'always', style: 'percent' });
const dec1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

export function StrengthSection() {
  const { gymSessions, bestSets, exercises, days, timeZone } = useAppData();
  const today = dateKey(Date.now(), timeZone);
  const all = useMemo(() => sessionsWithSeed(gymSessions, bestSets), [gymSessions, bestSets]);
  const exById = useMemo(() => new Map<string, ExerciseInfo & { name: string }>(exercises.map((e) => [e.id, e])), [exercises]);

  const bodyAt = (week: string) => {
    const weights = days.filter((d) => d.bodyMassKg !== undefined && d.date <= addDays(week, 6));
    return weights[weights.length - 1]?.bodyMassKg;
  };

  const basics = BASICS.map((id) => {
    const ex = exById.get(id);
    const h = e1rmHistory(all, id);
    const latest = h[h.length - 1];
    const fourWeeksAgo = [...h].reverse().find((p) => p.date <= addDays(today, -28));
    const weekly = weeklyBest(h).map((w) => ({ ...w, bodyKg: bodyAt(w.week) }));
    return {
      id,
      name: ex?.name ?? id,
      latest,
      change: latest && fourWeeksAgo ? latest.e1rm / fourWeeksAgo.e1rm - 1 : undefined,
      stagnant: isStagnant(h, today),
      relWarning: relativeStrengthWarning(weekly),
    };
  });

  const monday = weekStart(today);
  const thisWeek = weeklySetsPerMuscle(gymSessions, exById, monday);
  const lastWeek = weeklySetsPerMuscle(gymSessions, exById, addDays(monday, -7));
  // Show the last complete week early in the week, when this one has little data yet.
  const shown = [...thisWeek.values()].reduce((a, b) => a + b, 0) >= 10 ? { map: thisWeek, label: 'esta semana' } : { map: lastWeek, label: 'la semana pasada' };
  const rows = [...shown.map.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(10, ...rows.map((r) => r[1]));
  const warnings = volumeWarnings(shown.map);

  return (
    <>
      <section className="card">
        <h2>Fuerza: 1RM estimado de los básicos</h2>
        <ul className="list">
          {basics.map((b) => (
            <li key={b.id}>
              <span>
                {b.name}
                {b.stagnant && <span className="tag">estancado</span>}
                {b.relWarning && <span className="tag">¿pérdida de músculo?</span>}
              </span>
              <span className="nowrap">
                {b.latest ? kg(Math.round(b.latest.e1rm)) : '—'}
                {b.change !== undefined && <span className="muted"> {pct.format(b.change)} 4 sem.</span>}
              </span>
            </li>
          ))}
        </ul>
        {basics.some((b) => b.relWarning) && (
          <p className="metric-hint">
            "¿Pérdida de músculo?": la fuerza relativa al peso corporal ha bajado dos semanas seguidas mientras bajabas de peso.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Series por músculo ({shown.label})</h2>
        {rows.length === 0 ? (
          <p className="metric-hint">Sin sesiones registradas en ese periodo.</p>
        ) : (
          <>
            <div className="hbars" role="list">
              {rows.map(([muscle, sets]) => (
                <div className="hbar" role="listitem" key={muscle}>
                  <span className="hbar-label">{MUSCLE_LABEL[muscle]}</span>
                  <span className="hbar-track">
                    <span className="hbar-fill" style={{ width: `${(sets / max) * 100}%` }} />
                    <span className="hbar-min" style={{ left: `${(8 / max) * 100}%` }} aria-hidden />
                  </span>
                  <span className="hbar-value">{dec1.format(sets)}</span>
                </div>
              ))}
            </div>
            <p className="metric-hint">Principal = 1 serie, secundario = 0,5. Línea vertical: mínimo recomendado de 8 series.</p>
            {warnings.length > 0 && (
              <ul className="reasons metric-hint">
                {warnings.map((w) => (
                  <li key={w.muscle}>
                    {MUSCLE_LABEL[w.muscle]}: {dec1.format(w.sets)} series
                    {w.reason === 'low' ? ', por debajo de 8.' : ', muy por debajo del resto.'}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </>
  );
}
