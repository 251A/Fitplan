import { useState } from 'react';
import { useAppData } from '../../app/AppData';
import { answerQuestion, buildContext } from '../../data/ai/explanationService';
import { mondayOf } from '../../data/plan/planService';
import { dateKey } from '../../domain/dates';
import { useClaudeConfig } from '../week/WeekExtras';
import { useRecovery } from './useRecovery';

const EXAMPLES = ['¿Puedo correr mañana?', '¿Por qué hoy toca suave?', '¿Qué hago si no llego al gimnasio el jueves?'];

export function AskClaude() {
  const app = useAppData();
  const cfg = useClaudeConfig();
  const recovery = useRecovery();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!cfg) return null;

  async function ask(q: string) {
    if (!q.trim() || !cfg) return;
    setBusy(true);
    setError(undefined);
    setAnswer(undefined);
    try {
      const today = dateKey(Date.now(), app.timeZone);
      const ctx = buildContext({
        today,
        days: app.days,
        recovery,
        plans: app.weekPlans,
        monday: mondayOf(today),
        fiveK: app.cardioProgress?.fiveK,
        swim: app.cardioProgress?.swim,
      });
      setAnswer(await answerQuestion(cfg, ctx, q));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Pregunta a Claude</h2>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={EXAMPLES[0]} enterKeyHint="send" />
        <div className="row-gap">
          <button className="btn primary small" type="submit" disabled={busy || !question.trim()}>
            {busy ? 'Pensando…' : 'Preguntar'}
          </button>
          {!question &&
            EXAMPLES.slice(1).map((q) => (
              <button key={q} type="button" className="chip" onClick={() => setQuestion(q)}>
                {q}
              </button>
            ))}
        </div>
      </form>
      {answer && <p className="answer">{answer}</p>}
      {error && <p className="status error">{error}</p>}
      <p className="metric-hint">Claude solo ve resúmenes (no tus datos crudos de Salud) y no puede cambiar el plan.</p>
    </section>
  );
}
