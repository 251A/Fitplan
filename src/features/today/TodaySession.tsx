import { useState } from 'react';
import { useAppData } from '../../app/AppData';
import { dateKey } from '../../domain/dates';
import { adjustForRecovery, rescheduleMissed } from '../../domain/planner/adjustments';
import { mondayOf, saveWeekPlan } from '../../data/plan/planService';
import { dayName } from '../../domain/planner/weekPlanner';
import { IntensityTag, SessionDetails, sessionIcon, sessionTitle } from '../week/SessionDetails';
import { SessionActions } from '../week/SessionActions';
import { useRecovery } from './useRecovery';

export function TodaySession() {
  const { db, weekPlans, timeZone, reload } = useAppData();
  const recovery = useRecovery();
  const [message, setMessage] = useState<string>();
  const today = dateKey(Date.now(), timeZone);
  const plan = weekPlans.find((p) => p.weekStart === mondayOf(today));

  if (!plan) {
    return (
      <section className="card">
        <h2>Sesión de hoy</h2>
        <p className="metric-hint">No hay plan para esta semana.</p>
        <a className="btn primary" href="#week">
          Planificar la semana
        </a>
      </section>
    );
  }

  const sessions = plan.sessions.filter((s) => s.date === today && s.status !== 'skipped');
  if (sessions.length === 0) {
    const next = plan.sessions.find((s) => s.date > today && s.status !== 'skipped' && s.status !== 'done');
    return (
      <section className="card">
        <h2>Hoy: descanso</h2>
        <p className="metric-hint">
          Solo pasos.{next ? ` Próxima sesión: ${sessionTitle(next)} el ${dayName(next.date)}.` : ''}
        </p>
        {message && <p className="status ok">{message}</p>}
      </section>
    );
  }

  return (
    <>
      {sessions.map((s) => {
        const adj = s.status === 'done' ? undefined : adjustForRecovery(plan, s, recovery.state);
        return (
          <section key={s.id} className={`card today-session ${adj && adj.action !== 'asPlanned' ? 'adjusted' : ''}`}>
            <h2>
              {sessionIcon(s)} Hoy: {sessionTitle(s)} <IntensityTag s={s} />
            </h2>
            {adj && adj.action !== 'asPlanned' && <p className="question">{adj.advice}</p>}
            <SessionDetails session={s} adjusted={adj} />
            {adj?.action === 'moveOrLight' && adj.moveTo && (
              <button
                className="btn"
                onClick={async () => {
                  const { plan: next, message: m } = rescheduleMissed(plan, s.id, today, 'estabas en rojo');
                  await saveWeekPlan(db, next);
                  await reload();
                  setMessage(m);
                }}
              >
                Mover al {dayName(adj.moveTo)}
              </button>
            )}
            <SessionActions plan={plan} session={s} onMessage={setMessage} reason={recovery.state === 'red' ? 'estabas en rojo' : undefined} />
            {message && <p className="status ok">{message}</p>}
          </section>
        );
      })}
    </>
  );
}
