import { useAppData } from '../../app/AppData';
import { dateKey } from '../../domain/dates';
import { easyThirdRun, fiveKWeek, WEEKS_IN_PHASE, type FiveKState } from '../../domain/cardioPlans/fiveKPlan';
import { swimSession, type SwimState } from '../../domain/cardioPlans/swimPlan';
import { saveCardioProgress, recentRunsAndSwims, suggestedProgress } from '../../data/plan/planService';
import { FIVEK_PHASES, SWIM_PHASES } from './phaseText';
import { useZones } from './useZones';

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const shortDate = (ms: number) => new Date(ms).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

export function CardioView() {
  const { db, cardioProgress, workouts, timeZone, reload } = useAppData();
  const zones = useZones();
  const today = dateKey(Date.now(), timeZone);
  const progress = cardioProgress ?? suggestedProgress(workouts, today, timeZone);
  const { runs, swims } = recentRunsAndSwims(workouts, today, timeZone);
  const [a, b] = fiveKWeek(progress.fiveK);
  const c = easyThirdRun(progress.fiveK);
  const swim = swimSession(progress.swim, 'easy');

  async function setFiveK(fiveK: FiveKState) {
    await saveCardioProgress(db, { ...progress, fiveK });
    await reload();
  }
  async function setSwim(s: SwimState) {
    await saveCardioProgress(db, { ...progress, swim: s });
    await reload();
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Cardio</h1>
      </header>

      <section className="card">
        <h2>Plan 5K</h2>
        <p>
          {progress.fiveK.completed ? (
            <strong>¡Completado! Mantenimiento.</strong>
          ) : (
            <>
              <strong>Fase {progress.fiveK.phase}</strong> · semana {progress.fiveK.weekInPhase} de {WEEKS_IN_PHASE[progress.fiveK.phase]}
            </>
          )}
        </p>
        <ul className="list compact">
          {[a, b, c].map((r) => (
            <li key={r.slot}>
              <span>
                <strong>{r.title}</strong>
                <br />
                <span className="muted">{r.main}</span>
              </span>
              <span className="muted nowrap">~{r.totalMin} min</span>
            </li>
          ))}
        </ul>
        <p className="metric-hint">
          Avanzas cuando completas las 2 sesiones clave con esfuerzo ≤ 6/10
          {zones.ready ? ` y FC media ≤ ${zones.z3.max} lpm (techo de Z3)` : ''}. Si no, se repite la semana.
        </p>
        <label className="form">
          Cambiar de fase
          <select
            value={progress.fiveK.completed ? 'done' : String(progress.fiveK.phase)}
            onChange={(e) =>
              setFiveK(e.target.value === 'done' ? { ...progress.fiveK, completed: true } : { phase: Number(e.target.value) as FiveKState['phase'], weekInPhase: 1 })
            }
          >
            {FIVEK_PHASES.map((p) => (
              <option key={p.phase} value={p.phase}>
                Fase {p.phase}: {p.session}
              </option>
            ))}
            <option value="done">Completado (mantenimiento)</option>
          </select>
        </label>
      </section>

      <section className="card">
        <h2>Natación</h2>
        <p>
          {progress.swim.completed ? <strong>¡500 m seguidos conseguidos!</strong> : <strong>Fase {progress.swim.phase}</strong>} · {swim.main}
        </p>
        <p className="metric-hint">
          Calentamiento {swim.warmupM} m + {swim.main} + {swim.cooldownM} m suaves ({nf.format(swim.totalM)} m). Avanzas cuando la completas sin
          parar fuera de los descansos y con FC moderada.
        </p>
        <label className="form">
          Cambiar de fase
          <select value={String(progress.swim.phase)} onChange={(e) => setSwim({ phase: Number(e.target.value) as SwimState['phase'] })}>
            {SWIM_PHASES.map((p) => (
              <option key={p.phase} value={p.phase}>
                Fase {p.phase}: {p.session}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card">
        <h2>Tus zonas de FC</h2>
        {zones.ready ? (
          <>
            <ul className="list compact">
              {zones.zones.map((z) => (
                <li key={z.zone}>
                  <span>
                    Z{z.zone} {z.zone === 2 && <span className="tag">suave</span>}
                  </span>
                  <span className="nowrap">
                    {z.min}–{z.max} lpm
                  </span>
                </li>
              ))}
            </ul>
            <p className="metric-hint">
              Karvonen con FC máx. {zones.hrMax} y reposo {zones.rest ?? 62} lpm{zones.restEstimated ? ' (estimado: faltan datos de pulso en reposo)' : ' (media de 28 días)'}.
            </p>
          </>
        ) : (
          <p className="metric-hint">{zones.reason}</p>
        )}
      </section>

      <section className="card">
        <h2>Últimas 6 semanas</h2>
        {runs.length + swims.length === 0 ? (
          <p className="metric-hint">
            Aún no llegan entrenos desde Salud. Añade el bloque "Entrenamientos" al atajo para ver aquí tus carreras y nataciones (y para que la app
            lea tu FC media al marcar una sesión como hecha).
          </p>
        ) : (
          <ul className="list compact">
            {[...runs, ...swims]
              .sort((x, y) => y.startMs - x.startMs)
              .map((w) => (
                <li key={w.id}>
                  <span>
                    {w.kind === 'run' ? '🏃' : '🏊'} {shortDate(w.startMs)}
                  </span>
                  <span className="muted nowrap">
                    {Math.round(w.durationMin)} min
                    {w.distanceM ? ` · ${w.kind === 'swim' ? `${nf.format(w.distanceM)} m` : `${nf.format(w.distanceM / 1000)} km`}` : ''}
                    {w.avgHR ? ` · ${Math.round(w.avgHR)} lpm` : ''}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>

      {progress.log.length > 0 && (
        <section className="card">
          <h2>Progresión</h2>
          <ul className="reasons metric-hint">
            {[...progress.log].reverse().map((l) => (
              <li key={l.weekStart}>
                Semana del {new Date(`${l.weekStart}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}: {l.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
