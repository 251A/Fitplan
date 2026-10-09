import { useMemo, useState } from 'react';
import { useAppData } from '../../app/AppData';
import { dateKey } from '../../domain/dates';
import { deleteGymSession, saveGymSessions } from '../../data/db/repository';
import type { GymSession, SetEntry } from '../../data/db/models';
import { exerciseWeightLabel, lastSetFor, TEMPLATE_NAMES } from './gymStats';

interface EditableSet {
  weight: string;
  reps: string;
  rir: string;
}

interface EditableExercise {
  exerciseId: string;
  sets: EditableSet[];
}

const toNum = (s: string) => Number(s.replace(',', '.'));
const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

function fromSession(s: GymSession): EditableExercise[] {
  const out: EditableExercise[] = [];
  for (const set of [...s.sets].sort((a, b) => a.order - b.order)) {
    let last = out[out.length - 1];
    if (!last || last.exerciseId !== set.exerciseId) {
      last = { exerciseId: set.exerciseId, sets: [] };
      out.push(last);
    }
    last.sets.push({ weight: num.format(set.weightKg), reps: String(set.reps), rir: set.rir === undefined ? '' : String(set.rir) });
  }
  return out;
}

export function SessionEditor({ session, onDone }: { session?: GymSession; onDone: () => void }) {
  const { db, exercises, gymSessions, bestSets, timeZone, reload } = useAppData();
  const [date, setDate] = useState(session?.date ?? dateKey(Date.now(), timeZone));
  const [name, setName] = useState(session?.templateName ?? '');
  const [duration, setDuration] = useState(session?.durationMin ? String(session.durationMin) : '');
  const [items, setItems] = useState<EditableExercise[]>(session ? fromSession(session) : []);
  const [error, setError] = useState<string>();
  const sorted = useMemo(() => [...exercises].sort((a, b) => a.name.localeCompare(b.name, 'es')), [exercises]);
  const exById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const update = (i: number, f: (e: EditableExercise) => EditableExercise) =>
    setItems((xs) => xs.map((x, j) => (j === i ? f(x) : x)));

  function addExercise(id: string) {
    const last = lastSetFor(id, gymSessions, bestSets, date);
    const first: EditableSet = { weight: last ? num.format(last.weightKg) : '', reps: last ? String(last.reps) : '', rir: '' };
    setItems((xs) => [...xs, { exerciseId: id, sets: [first] }]);
  }

  async function save() {
    const sets: SetEntry[] = [];
    for (const it of items) {
      for (const s of it.sets) {
        const w = toNum(s.weight);
        const r = toNum(s.reps);
        if (s.weight === '' && s.reps === '') continue;
        if (!Number.isFinite(w) || !Number.isFinite(r) || w < 0 || r < 0) {
          setError(`Revisa las series de ${exById.get(it.exerciseId)?.name ?? 'un ejercicio'}.`);
          return;
        }
        const rir = s.rir === '' ? undefined : toNum(s.rir);
        sets.push({ exerciseId: it.exerciseId, order: sets.length, weightKg: w, reps: Math.round(r), rir, skipped: w === 0 });
      }
    }
    if (!name.trim()) return setError('Ponle nombre a la sesión.');
    if (sets.length === 0) return setError('Añade al menos una serie.');
    const s: GymSession = {
      ...(session ?? { id: `app-${Date.now()}`, source: 'app' as const, summaryOnly: false, createdAt: Date.now() }),
      date,
      templateName: name.trim(),
      durationMin: duration ? toNum(duration) : undefined,
      sets,
      summaryOnly: false,
      needsReview: false,
    };
    await saveGymSessions(db, [s]);
    await reload();
    onDone();
  }

  async function remove() {
    if (!session || !confirm('¿Borrar esta sesión? Se borrará también en tus otros dispositivos.')) return;
    await deleteGymSession(db, session.id);
    await reload();
    onDone();
  }

  return (
    <div className="page">
      <header className="page-header">
        <button className="link-btn" onClick={onDone}>
          ‹ Volver
        </button>
        <h1>{session ? 'Editar sesión' : 'Registrar sesión'}</h1>
      </header>

      <section className="card form">
        <label>
          Fecha
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Sesión
          <input list="template-names" value={name} onChange={(e) => setName(e.target.value)} placeholder="Empuje A" />
          <datalist id="template-names">
            {TEMPLATE_NAMES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label>
          Duración (min, opcional)
          <input inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </label>
        {session?.needsReview && <p className="status error">Marcada para revisar al importarla: comprueba las series.</p>}
      </section>

      {items.map((it, i) => {
        const ex = exById.get(it.exerciseId);
        const last = lastSetFor(it.exerciseId, gymSessions.filter((s) => s.id !== session?.id), bestSets, date);
        return (
          <section className="card" key={`${it.exerciseId}-${i}`}>
            <div className="chart-head">
              <h2>{ex?.name ?? it.exerciseId}</h2>
              <button className="link-btn danger" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                Quitar
              </button>
            </div>
            {ex && last && (
              <p className="metric-hint">
                Última vez: {exerciseWeightLabel(ex, last.weightKg)} × {last.reps}
                {ex.loadMode === 'perDumbbell' && ' · peso por mancuerna'}
              </p>
            )}
            <table className="sets-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>kg</th>
                  <th>Reps</th>
                  <th>RIR</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {it.sets.map((s, j) => (
                  <tr key={j}>
                    <td>{j + 1}</td>
                    {(['weight', 'reps', 'rir'] as const).map((f) => (
                      <td key={f}>
                        <input
                          inputMode="decimal"
                          value={s[f]}
                          placeholder={f === 'rir' ? '—' : ''}
                          onChange={(e) =>
                            update(i, (x) => ({ ...x, sets: x.sets.map((y, k) => (k === j ? { ...y, [f]: e.target.value } : y)) }))
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        className="link-btn danger"
                        aria-label="Quitar serie"
                        onClick={() => update(i, (x) => ({ ...x, sets: x.sets.filter((_, k) => k !== j) }))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="btn"
              onClick={() => update(i, (x) => ({ ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? { weight: '', reps: '' }), rir: '' }] }))}
            >
              + Serie
            </button>
            <p className="metric-hint">0 kg = ejercicio no realizado (no cuenta para volumen ni 1RM).</p>
          </section>
        );
      })}

      <section className="card form">
        <label>
          Añadir ejercicio
          <select value="" onChange={(e) => e.target.value && addExercise(e.target.value)}>
            <option value="">Elige un ejercicio…</option>
            {sorted.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && <p className="status error">{error}</p>}
      <div className="row-gap" style={{ marginBottom: 20 }}>
        <button className="btn primary" onClick={save}>
          Guardar sesión
        </button>
        {session && (
          <button className="btn danger" onClick={remove}>
            Borrar
          </button>
        )}
      </div>
    </div>
  );
}
