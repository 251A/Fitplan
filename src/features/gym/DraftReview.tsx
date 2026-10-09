import { useMemo } from 'react';
import type { PreparedImage } from '../../data/import/imageUtils';
import {
  reviewQuestions,
  topWeight,
  type DraftExercise,
  type DraftSession,
  type ReviewContext,
} from '../../data/import/importValidator';
import { normalizeWeight, type LoadMode } from '../../domain/strength/strength';
import { kg } from './gymStats';

const toNum = (s: string) => Number(s.replace(',', '.'));

export function DraftReview(props: {
  draft: DraftSession;
  ctx: ReviewContext;
  images: PreparedImage[];
  onChange: (d: DraftSession) => void;
  onLoadMode: (exerciseId: string, mode: LoadMode) => void;
}) {
  const { draft: d, ctx, onChange } = props;
  const questions = reviewQuestions(d, ctx);
  const library = useMemo(() => [...ctx.exercises.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')), [ctx.exercises]);

  const setEx = (i: number, patch: Partial<DraftExercise>) =>
    onChange({ ...d, exercises: d.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  return (
    <section className={`card draft ${d.include ? '' : 'excluded'}`}>
      <div className="chart-head">
        <label className="check">
          <input type="checkbox" checked={d.include} onChange={(e) => onChange({ ...d, include: e.target.checked })} />
          <strong>
            {d.name} · {new Date(`${d.date}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
          </strong>
        </label>
        {questions.length > 0 && d.include && <span className="tag">{questions.length} por revisar</span>}
      </div>

      {d.duplicateOf && (
        <p className="metric-hint">Ya tienes una sesión con esta fecha y nombre. Márcala solo si quieres reemplazarla.</p>
      )}
      {d.issues.map((issue) => (
        <p key={issue} className="status error">
          ⚠️ {issue}
        </p>
      ))}

      {d.include && (
        <>
          <div className="form inline-form">
            <label>
              Fecha
              <input type="date" value={d.date} onChange={(e) => onChange({ ...d, date: e.target.value })} />
            </label>
            <label>
              Nombre
              <input value={d.name} onChange={(e) => onChange({ ...d, name: e.target.value })} />
            </label>
          </div>

          {d.summaryOnly && <p className="metric-hint">Solo había la tarjeta resumen: se guarda sin series.</p>}

          {d.exercises.map((e, i) => {
            const ex = e.exerciseId ? ctx.exercises.get(e.exerciseId) : undefined;
            const q = questions.filter((x) => x.exerciseIndex === i);
            const mode = ex ? (ctx.loadModeAnswers.get(ex.id) ?? ex.loadMode) : 'total';
            return (
              <div key={i} className={`draft-ex ${q.length ? 'needs' : ''}`}>
                <div className="metric-hint">Leído: “{e.rawName}”</div>
                <select
                  value={e.exerciseId ?? ''}
                  onChange={(ev) => setEx(i, { exerciseId: ev.target.value || undefined, confirmed: true, jumpAcknowledged: false })}
                >
                  <option value="">— Elige el ejercicio —</option>
                  {library.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>

                {q.map((question) => (
                  <div key={question.kind} className="question">
                    <p>{question.text}</p>
                    <div className="row-gap">
                      {question.kind === 'confirmMatch' && (
                        <button className="btn small primary" onClick={() => setEx(i, { confirmed: true })}>
                          Sí, es ese
                        </button>
                      )}
                      {question.kind === 'loadMode' && ex && (
                        <>
                          <button className="btn small" onClick={() => props.onLoadMode(ex.id, 'perDumbbell')}>
                            De una mancuerna
                          </button>
                          <button
                            className="btn small"
                            onClick={() => {
                              props.onLoadMode(ex.id, 'perDumbbell');
                              setEx(i, { loggedAsPair: true });
                            }}
                          >
                            Del par (÷2)
                          </button>
                          <button className="btn small" onClick={() => props.onLoadMode(ex.id, 'total')}>
                            Es peso total
                          </button>
                        </>
                      )}
                      {question.kind === 'jump' && (
                        <>
                          <button className="btn small" onClick={() => setEx(i, { jumpAcknowledged: true })}>
                            Está bien
                          </button>
                          {mode === 'perDumbbell' && !e.loggedAsPair && (
                            <button className="btn small" onClick={() => setEx(i, { loggedAsPair: true })}>
                              Era el par (÷2)
                            </button>
                          )}
                          <span className="metric-hint">¿Era en máquina? Elige el ejercicio correcto arriba.</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                <table className="sets-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>kg</th>
                      <th>Reps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.sets.map((s, j) => (
                      <tr key={j} className={s.weightKg === 0 ? 'skipped' : ''}>
                        <td>{j + 1}</td>
                        <td>
                          <input
                            inputMode="decimal"
                            defaultValue={String(s.weightKg).replace('.', ',')}
                            onBlur={(ev) => {
                              const v = toNum(ev.target.value);
                              if (Number.isFinite(v) && v >= 0)
                                setEx(i, { sets: e.sets.map((x, k) => (k === j ? { ...x, weightKg: v } : x)), jumpAcknowledged: false });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            inputMode="numeric"
                            defaultValue={String(s.reps)}
                            onBlur={(ev) => {
                              const v = toNum(ev.target.value);
                              if (Number.isFinite(v) && v >= 0) setEx(i, { sets: e.sets.map((x, k) => (k === j ? { ...x, reps: Math.round(v) } : x)) });
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ex && mode === 'perDumbbell' && (
                  <label className="check metric-hint">
                    <input type="checkbox" checked={e.loggedAsPair} onChange={(ev) => setEx(i, { loggedAsPair: ev.target.checked })} />
                    El peso apuntado es del par → se guarda {kg(normalizeWeight(Math.max(0, ...e.sets.map((s) => s.weightKg)), mode, true))} por
                    mancuerna
                  </label>
                )}
                {ex && e.sets.some((s) => s.weightKg === 0) && <p className="metric-hint">Las series a 0 kg se guardan como no realizadas.</p>}
                {ex && mode !== 'unconfirmed' && (
                  <p className="metric-hint">Se guardará: máx. {kg(topWeight(e, mode))}{mode === 'perDumbbell' ? ' por mancuerna' : ''}.</p>
                )}
              </div>
            );
          })}

          {d.pages.length > 0 && (
            <details className="chart-table">
              <summary>Ver las {d.pages.length} capturas de esta sesión</summary>
              <div className="thumbs">
                {d.pages.map((p) => (
                  <figure key={p}>
                    <img src={props.images[p]?.previewUrl} alt={props.images[p]?.label} />
                  </figure>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
