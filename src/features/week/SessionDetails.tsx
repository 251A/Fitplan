import { useAppData } from '../../app/AppData';
import { adjustedSets, type AdjustedSession } from '../../domain/planner/adjustments';
import { TEMPLATES } from '../../domain/planner/gymTemplates';
import type { PlannedSession } from '../../domain/planner/weekPlanner';
import { useZones } from '../cardio/useZones';
import { exerciseWeightLabel, lastSetFor } from '../gym/gymStats';

const INTENSITY: Record<PlannedSession['intensity'], string> = { easy: 'Suave', moderate: 'Moderada', hard: 'Exigente' };
const nf = new Intl.NumberFormat('es-ES');

export function sessionTitle(s: PlannedSession): string {
  if (s.kind === 'gym') return s.gymTemplate ?? 'Gimnasio';
  if (s.kind === 'run') return s.run?.title ?? 'Carrera';
  if (s.kind === 'swim') return s.swim?.title ?? 'Natación';
  return 'Descanso';
}

export function sessionIcon(s: PlannedSession): string {
  return s.kind === 'gym' ? '🏋️' : s.kind === 'run' ? '🏃' : s.kind === 'swim' ? '🏊' : '🧘';
}

export function IntensityTag({ s }: { s: PlannedSession }) {
  return <span className={`tag intensity-${s.intensity}`}>{INTENSITY[s.intensity]}</span>;
}

/** Content of a session: exercises with last weight, or the run / swim prescription. */
export function SessionDetails({ session: s, adjusted }: { session: PlannedSession; adjusted?: AdjustedSession }) {
  const { exercises, gymSessions, bestSets } = useAppData();
  const zones = useZones();
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const rirDelta = adjusted?.rirDelta ?? 0;
  const setsDelta = adjusted?.setsDelta ?? 0;

  if (s.kind === 'gym' && s.gymTemplate) {
    const t = TEMPLATES[s.gymTemplate];
    return (
      <>
        <p className="metric-hint">
          ~{s.minutes} min · deja {rirDelta >= 3 ? '3' : rirDelta >= 1 ? '2–3' : '1–2'} repeticiones en reserva (RIR)
          {s.setsFactor && s.setsFactor < 1 ? ` · ${Math.round((1 - s.setsFactor) * 100)} % menos de series` : ''}
        </p>
        <ul className="list compact">
          {t.exercises.map((te) => {
            const ex = exById.get(te.exerciseId);
            const last = lastSetFor(te.exerciseId, gymSessions, bestSets);
            const sets = adjustedSets(te.sets, s.setsFactor, setsDelta);
            return (
              <li key={te.exerciseId}>
                <span>
                  {ex?.name ?? te.exerciseId}
                  <br />
                  <span className="muted">
                    {sets} × {te.reps}
                  </span>
                </span>
                <span className="muted nowrap">{ex && last ? `${exerciseWeightLabel(ex, last.weightKg)} × ${last.reps}` : 'sin registro'}</span>
              </li>
            );
          })}
        </ul>
        <p className="metric-hint">A la derecha, el último peso usado. La app nunca decide las cargas por ti.</p>
      </>
    );
  }

  if (s.kind === 'run' && s.run) {
    const r = s.run;
    return (
      <>
        <ol className="steps-list">
          <li>Calentamiento: {r.warmupMin} min caminando rápido</li>
          <li>
            <strong>{r.main}</strong>
          </li>
          <li>Vuelta a la calma: {r.cooldownMin} min caminando</li>
        </ol>
        <p className="metric-hint">
          ~{r.totalMin} min · {r.notes}
          {zones.ready && ` Z2: ${zones.z2.min}–${zones.z2.max} lpm.`}
        </p>
      </>
    );
  }

  if (s.kind === 'swim' && s.swim) {
    const w = s.swim;
    return (
      <>
        <ol className="steps-list">
          <li>Calentamiento: {nf.format(w.warmupM)} m suaves</li>
          <li>
            <strong>{w.main}</strong>
          </li>
          <li>Vuelta a la calma: {nf.format(w.cooldownM)} m</li>
        </ol>
        <p className="metric-hint">
          {nf.format(w.totalM)} m · ~{w.totalMin} min · {w.notes}
        </p>
      </>
    );
  }
  return null;
}
