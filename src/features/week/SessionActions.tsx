import { useState } from 'react';
import { useAppData } from '../../app/AppData';
import { dateKey, addDays } from '../../domain/dates';
import { canPlace, rescheduleMissed } from '../../domain/planner/adjustments';
import { dayName, type PlannedSession, type WeekPlan } from '../../domain/planner/weekPlanner';
import { saveWeekPlan } from '../../data/plan/planService';

/** "Hecho" (with effort for cardio), "No puedo" (reschedule) and "Mover a…" for one session. */
export function SessionActions({ plan, session: s, reason, onMessage }: { plan: WeekPlan; session: PlannedSession; reason?: string; onMessage?: (m: string) => void }) {
  const { db, reload, timeZone } = useAppData();
  const [asking, setAsking] = useState(false);
  const [effort, setEffort] = useState(5);
  const [noStops, setNoStops] = useState(true);
  const today = dateKey(Date.now(), timeZone);

  async function update(next: WeekPlan, message?: string) {
    await saveWeekPlan(db, next);
    await reload();
    if (message) onMessage?.(message);
  }

  async function markDone() {
    const next: WeekPlan = structuredClone(plan);
    const x = next.sessions.find((y) => y.id === s.id)!;
    x.status = 'done';
    x.result = { ...x.result, doneAt: Date.now(), ...(s.kind !== 'gym' ? { effort } : {}), ...(s.kind === 'swim' ? { noStops } : {}) };
    setAsking(false);
    await update(next, '¡Hecho!');
  }

  async function undo() {
    const next: WeekPlan = structuredClone(plan);
    const x = next.sessions.find((y) => y.id === s.id)!;
    x.status = 'planned';
    delete x.result;
    await update(next);
  }

  async function cannot() {
    const from = s.date < today ? today : s.date;
    const { plan: next, message } = rescheduleMissed(plan, s.id, from, reason ?? 'no pudiste', Date.now());
    await update(next, message);
  }

  async function moveTo(date: string) {
    const next: WeekPlan = structuredClone(plan);
    const x = next.sessions.find((y) => y.id === s.id)!;
    const ok = canPlace(next, x, date);
    if (!ok && !confirm(`Mover al ${dayName(date)} rompe alguna regla del plan (día ocupado, pierna junto a carrera fuerte…). ¿Moverla igualmente?`)) return;
    x.rationale.push(`Movida a mano del ${dayName(x.date)} al ${dayName(date)}.`);
    x.date = date;
    x.status = 'moved';
    next.sessions.sort((a, b) => a.date.localeCompare(b.date));
    await update(next, `Movida al ${dayName(date)}.`);
  }

  if (s.status === 'done') {
    return (
      <div className="row-gap">
        <span className="status ok">✓ Hecha{s.result?.effort ? ` · esfuerzo ${s.result.effort}/10` : ''}</span>
        <button className="link-btn" onClick={undo}>
          Deshacer
        </button>
      </div>
    );
  }
  if (s.status === 'skipped') return <p className="metric-hint">Descartada esta semana.</p>;

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(plan.weekStart, i)).filter((d) => d !== s.date && d >= today);

  return (
    <>
      {asking ? (
        <div className="done-form">
          {s.kind !== 'gym' && (
            <label>
              ¿Cuánto te ha costado? <strong>{effort}/10</strong>
              <input type="range" min={1} max={10} value={effort} onChange={(e) => setEffort(Number(e.target.value))} />
              <span className="metric-hint">1 = paseo · 6 = exigente pero controlado · 10 = al límite</span>
            </label>
          )}
          {s.kind === 'swim' && (
            <label className="check">
              <input type="checkbox" checked={noStops} onChange={(e) => setNoStops(e.target.checked)} /> Sin parar fuera de los descansos
            </label>
          )}
          <div className="row-gap">
            <button className="btn primary" onClick={markDone}>
              Guardar
            </button>
            <button className="btn" onClick={() => setAsking(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="row-gap">
          <button className="btn primary small" onClick={() => (s.kind === 'gym' ? markDone() : setAsking(true))}>
            Hecho
          </button>
          <button className="btn small" onClick={cannot}>
            No puedo
          </button>
          {weekDays.length > 0 && (
            <select className="small-select" value="" onChange={(e) => e.target.value && moveTo(e.target.value)} aria-label="Mover a otro día">
              <option value="">Mover a…</option>
              {weekDays.map((d) => (
                <option key={d} value={d}>
                  {dayName(d)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </>
  );
}
