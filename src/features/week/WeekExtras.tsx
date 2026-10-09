import { useEffect, useState } from 'react';
import { useAppData } from '../../app/AppData';
import { DEFAULT_MODEL, type ClaudeConfig } from '../../data/ai/anthropicClient';
import { buildContext, explainPlan, templateSummary } from '../../data/ai/explanationService';
import { getClaudeSettings } from '../../data/db/repository';
import { saveWeekPlan } from '../../data/plan/planService';
import { dateKey } from '../../domain/dates';
import { planToIcs } from '../../domain/planner/calendarExport';
import type { WeekPlan } from '../../domain/planner/weekPlanner';
import { weeklySummary } from '../../domain/planner/weeklySummary';
import { useRecovery } from '../today/useRecovery';

/** Claude config from this device, or undefined when no API key is stored. */
export function useClaudeConfig(): ClaudeConfig | undefined {
  const { db } = useAppData();
  const [cfg, setCfg] = useState<ClaudeConfig>();
  useEffect(() => {
    getClaudeSettings(db).then((s) => setCfg(s?.apiKey ? { apiKey: s.apiKey, model: s.model || DEFAULT_MODEL } : undefined));
  }, [db]);
  return cfg;
}

export function WeekSummaryCard({ plan }: { plan: WeekPlan }) {
  const { days, gymSessions, timeZone } = useAppData();
  const today = dateKey(Date.now(), timeZone);
  if (today < plan.weekStart) return null;
  const s = weeklySummary(
    plan,
    days,
    gymSessions.filter((g) => g.date && g.sets.length > 0).map((g) => g.date!),
    today,
  );
  const finished = today > plan.weekStart && today >= plan.sessions.reduce((a, x) => (x.date > a ? x.date : a), plan.weekStart);
  return (
    <section className="card">
      <h2>{finished ? 'Resumen de la semana' : 'Cómo va la semana'}</h2>
      <ul className="reasons">
        {s.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}

export function PlanSummaryCard({ plan }: { plan: WeekPlan }) {
  const app = useAppData();
  const cfg = useClaudeConfig();
  const recovery = useRecovery();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function writeWithClaude() {
    if (!cfg) return;
    setBusy(true);
    setError(undefined);
    try {
      const ctx = buildContext({
        today: dateKey(Date.now(), app.timeZone),
        days: app.days,
        recovery,
        plans: app.weekPlans,
        monday: plan.weekStart,
        fiveK: app.cardioProgress?.fiveK,
        swim: app.cardioProgress?.swim,
      });
      const text = await explainPlan(cfg, ctx);
      await saveWeekPlan(app.db, { ...plan, summaryText: text });
      await app.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>El plan en pocas palabras</h2>
      <p>{plan.summaryText ?? templateSummary(plan)}</p>
      <div className="row-gap">
        {cfg && (
          <button className="btn small" disabled={busy} onClick={writeWithClaude}>
            {busy ? 'Redactando…' : plan.summaryText ? 'Redactar de nuevo con Claude' : 'Explicar con Claude'}
          </button>
        )}
        <CalendarButton plan={plan} />
      </div>
      {error && <p className="status error">{error}</p>}
      {plan.summaryText && <p className="metric-hint">Texto de Claude: describe el plan, no lo cambia.</p>}
    </section>
  );
}

function CalendarButton({ plan }: { plan: WeekPlan }) {
  const { exercises } = useAppData();
  const names = new Map(exercises.map((e) => [e.id, e.name]));

  async function exportIcs() {
    const ics = planToIcs(plan, (id) => names.get(id) ?? id);
    const name = `fitplan-${plan.weekStart}.ics`;
    const file = new File([ics], name, { type: 'text/calendar' });
    // iPhone: the share sheet offers "Añadir a Calendario"; desktop: download the file.
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Plan FitPlan' }).catch(() => undefined);
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <button className="btn small" onClick={exportIcs}>
      Añadir al calendario
    </button>
  );
}
