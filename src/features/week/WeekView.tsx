import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppData';
import { addDays, dateKey, isoWeekday } from '../../domain/dates';
import { dayName, type Activity, type DayAvailability, type WeekPlan } from '../../domain/planner/weekPlanner';
import {
  createPlan,
  DEFAULT_AVAILABILITY,
  deleteWeekPlan,
  mondayOf,
  saveCardioProgress,
  suggestedProgress,
} from '../../data/plan/planService';
import { useZones } from '../cardio/useZones';
import { FIVEK_PHASES, SWIM_PHASES } from '../cardio/phaseText';
import { IntensityTag, SessionDetails, sessionIcon, sessionTitle } from './SessionDetails';
import { SessionActions } from './SessionActions';
import { PlanSummaryCard, WeekSummaryCard } from './WeekExtras';

const ACT_LABEL: Record<Activity, string> = { gym: 'Gimnasio', run: 'Correr', swim: 'Nadar' };
const nf = new Intl.NumberFormat('es-ES');
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function CardioSetup() {
  const { db, workouts, timeZone, reload } = useAppData();
  const today = dateKey(Date.now(), timeZone);
  const suggestion = suggestedProgress(workouts, today, timeZone);
  const [five, setFive] = useState<number>(suggestion.fiveK.phase);
  const [swim, setSwim] = useState<number>(suggestion.swim.phase);

  return (
    <section className="card">
      <h2>Antes de planificar: ¿en qué punto estás?</h2>
      <p className="metric-hint">
        Elige la fase del plan 5K y de natación que te resulte cómoda hoy. La app avanza sola cuando completes las sesiones sin pasarte de
        esfuerzo.
      </p>
      <fieldset className="phase-pick">
        <legend>Carrera (objetivo: 5K seguidos)</legend>
        {FIVEK_PHASES.map((p) => (
          <label key={p.phase} className="check">
            <input type="radio" name="fivek" checked={five === p.phase} onChange={() => setFive(p.phase)} />
            <span>
              <strong>Fase {p.phase}</strong> · {p.session}
              <br />
              <span className="muted">{p.whenToStart}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="phase-pick">
        <legend>Natación (objetivo: 500 m seguidos)</legend>
        {SWIM_PHASES.map((p) => (
          <label key={p.phase} className="check">
            <input type="radio" name="swim" checked={swim === p.phase} onChange={() => setSwim(p.phase)} />
            <span>
              <strong>Fase {p.phase}</strong> · {p.session}
              <br />
              <span className="muted">{p.whenToStart}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <button
        className="btn primary"
        onClick={async () => {
          await saveCardioProgress(db, {
            ...suggestion,
            fiveK: { phase: five as 1 | 2 | 3 | 4 | 5, weekInPhase: 1 },
            swim: { phase: swim as 1 | 2 | 3 | 4 },
          });
          await reload();
        }}
      >
        Guardar y seguir
      </button>
    </section>
  );
}

function AvailabilityForm({ monday, initial, onPlanned }: { monday: string; initial?: WeekPlan; onPlanned: () => void }) {
  const { db, profile, workouts, gymSessions, weekPlans, timeZone, reload } = useAppData();
  const zones = useZones();
  const today = dateKey(Date.now(), timeZone);
  // Start from the last plan's availability: most weeks look alike.
  const last = [...weekPlans].sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
  const [avail, setAvail] = useState<DayAvailability[]>(structuredClone(initial?.availability ?? last?.availability ?? DEFAULT_AVAILABILITY));
  const [maxGym, setMaxGym] = useState(initial?.maxGymDays ?? profile?.gymBaseDays ?? 5);
  const [busy, setBusy] = useState(false);

  const toggle = (wd: number, a: Activity) =>
    setAvail((xs) => xs.map((d) => (d.weekday !== wd ? d : { ...d, allowed: d.allowed.includes(a) ? d.allowed.filter((x) => x !== a) : [...d.allowed, a] })));
  const setMinutes = (wd: number, v: string) =>
    setAvail((xs) => xs.map((d) => (d.weekday !== wd ? d : { ...d, maxMinutes: v === '' ? undefined : Math.max(0, Number(v)) })));

  async function plan() {
    if (!profile) return;
    setBusy(true);
    try {
      await createPlan(
        db,
        { monday, availability: avail, maxGymDays: maxGym, availableFrom: today > monday ? today : undefined },
        { profile, workouts, gymSessions, timeZone, z3Max: zones.ready ? zones.z3.max : 999 },
      );
      await reload();
      onPlanned();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>¿Qué puedes hacer cada día?</h2>
      <p className="metric-hint">
        Marca lo que te encaja cada día y, si quieres, los minutos que tienes.
        {today > monday && ' Los días que ya han pasado no se usan.'}
      </p>
      <div className="avail">
        {avail.map((d) => {
          const date = addDays(monday, d.weekday - 1);
          return (
            <div className="avail-row" key={d.weekday}>
              <span className="avail-day">
                {cap(dayName(date)).slice(0, 3)} <span className="muted">{shortDate(date).split(' ')[0]}</span>
              </span>
              <span className="chips">
                {(['gym', 'run', 'swim'] as const).map((a) => (
                  <button key={a} className={`chip ${d.allowed.includes(a) ? 'on' : ''}`} aria-pressed={d.allowed.includes(a)} onClick={() => toggle(d.weekday, a)}>
                    {ACT_LABEL[a]}
                  </button>
                ))}
              </span>
              <input
                className="avail-min"
                inputMode="numeric"
                placeholder="min"
                aria-label={`Minutos disponibles el ${dayName(date)}`}
                value={d.maxMinutes ?? ''}
                onChange={(e) => setMinutes(d.weekday, e.target.value)}
              />
            </div>
          );
        })}
      </div>
      <label className="form" style={{ marginTop: 12 }}>
        Máximo de días de gimnasio esta semana
        <select value={maxGym} onChange={(e) => setMaxGym(Number(e.target.value))}>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button className="btn primary" style={{ marginTop: 12 }} disabled={busy || !profile} onClick={plan}>
        {busy ? 'Planificando…' : 'Planificar semana'}
      </button>
    </section>
  );
}

function PlanView({ plan, onReplan }: { plan: WeekPlan; onReplan: () => void }) {
  const { timeZone } = useAppData();
  const [message, setMessage] = useState<string>();
  const [open, setOpen] = useState<string>();
  const today = dateKey(Date.now(), timeZone);
  const days = Array.from({ length: 7 }, (_, i) => addDays(plan.weekStart, i));

  return (
    <>
      {plan.warnings.length > 0 && (
        <section className="card warn-card">
          <ul className="reasons">
            {plan.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}
      {message && <p className="status ok">{message}</p>}

      <WeekSummaryCard plan={plan} />
      <PlanSummaryCard plan={plan} />

      {days.map((d) => {
        const sessions = plan.sessions.filter((s) => s.date === d);
        const isToday = d === today;
        return (
          <section key={d} className={`card day-card ${isToday ? 'today' : ''} ${d < today ? 'past' : ''}`}>
            <div className="chart-head">
              <h2>
                {cap(dayName(d))} <span className="muted">{shortDate(d)}</span>
                {isToday && <span className="tag">hoy</span>}
              </h2>
              <span className="muted nowrap">{nf.format(plan.stepTargets[d] ?? 10000)} pasos</span>
            </div>
            {sessions.length === 0 && <p className="metric-hint">Descanso: solo pasos.</p>}
            {sessions.map((s) => (
              <div key={s.id} className={`plan-session status-${s.status}`}>
                <button className="plan-session-head" onClick={() => setOpen(open === s.id ? undefined : s.id)} aria-expanded={open === s.id}>
                  <span>
                    {sessionIcon(s)} <strong>{sessionTitle(s)}</strong> <IntensityTag s={s} />
                  </span>
                  <span className="muted">{open === s.id ? '▲' : '▼'}</span>
                </button>
                {s.status === 'moved' && <p className="metric-hint">{s.rationale[s.rationale.length - 1]}</p>}
                {open === s.id && (
                  <>
                    <SessionDetails session={s} />
                    <details className="chart-table">
                      <summary>Por qué este día</summary>
                      <ul className="reasons metric-hint">
                        {s.rationale.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </details>
                  </>
                )}
                <SessionActions plan={plan} session={s} onMessage={setMessage} reason={d < today ? 'no la hiciste' : undefined} />
              </div>
            ))}
          </section>
        );
      })}

      <div className="row-gap" style={{ marginBottom: 20 }}>
        <button className="btn" onClick={onReplan}>
          Cambiar disponibilidad y replanificar
        </button>
      </div>
    </>
  );
}

export function WeekView() {
  const { db, weekPlans, cardioProgress, timeZone, reload } = useAppData();
  const today = dateKey(Date.now(), timeZone);
  const thisMonday = mondayOf(today);
  // On weekends the natural thing is to plan next week (spec: "cada domingo").
  const [monday, setMonday] = useState(isoWeekday(today) >= 6 && !weekPlans.some((p) => p.weekStart === addDays(thisMonday, 7)) ? addDays(thisMonday, 7) : thisMonday);
  const [replanning, setReplanning] = useState(false);
  const plan = useMemo(() => weekPlans.find((p) => p.weekStart === monday), [weekPlans, monday]);
  const progress = cardioProgress;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Semana</h1>
        <p className="subtitle">
          {shortDate(monday)} – {shortDate(addDays(monday, 6))}
          {plan?.deload && ' · descarga'}
        </p>
      </header>

      <div className="range-tabs" role="group" aria-label="Semana">
        <button aria-pressed={monday === thisMonday} onClick={() => setMonday(thisMonday)}>
          Esta semana
        </button>
        <button aria-pressed={monday === addDays(thisMonday, 7)} onClick={() => setMonday(addDays(thisMonday, 7))}>
          Próxima
        </button>
      </div>

      {!progress ? (
        <CardioSetup />
      ) : !plan || replanning ? (
        <>
          {plan && <p className="metric-hint">Replanificar sustituye el plan de esta semana (se pierden las sesiones marcadas como hechas).</p>}
          <AvailabilityForm
            monday={monday}
            initial={plan}
            onPlanned={() => setReplanning(false)}
          />
          {replanning && (
            <button className="btn" onClick={() => setReplanning(false)}>
              Cancelar
            </button>
          )}
        </>
      ) : (
        <PlanView
          plan={plan}
          onReplan={async () => {
            if (plan.sessions.some((s) => s.status === 'done') && !confirm('Ya hay sesiones hechas esta semana. ¿Replanificar igualmente?')) return;
            setReplanning(true);
          }}
        />
      )}

      {progress && plan && !replanning && (
        <section className="card">
          <h2>Planes de cardio</h2>
          <p className="metric-hint">
            5K: {progress.fiveK.completed ? 'completado (mantenimiento)' : `fase ${progress.fiveK.phase}, semana ${progress.fiveK.weekInPhase}`} · Natación:{' '}
            {progress.swim.completed ? 'completado' : `fase ${progress.swim.phase}`}. Detalles en la pestaña Cardio.
          </p>
          <button
            className="link-btn danger"
            onClick={async () => {
              if (!confirm('¿Borrar el plan de esta semana?')) return;
              await deleteWeekPlan(db, plan.weekStart);
              await reload();
            }}
          >
            Borrar el plan de esta semana
          </button>
        </section>
      )}
    </div>
  );
}
