import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppData } from '../../app/AppData';
import { ClaudeError, DEFAULT_MODEL } from '../../data/ai/anthropicClient';
import { getClaudeSettings, saveExercises, saveGymSessions } from '../../data/db/repository';
import type { Exercise } from '../../data/db/models';
import type { ExtractedPage } from '../../data/import/extraction';
import { filesToPages, type PreparedImage } from '../../data/import/imageUtils';
import {
  buildDrafts,
  draftToSession,
  isReady,
  learnedAliases,
  type DraftSession,
  type ReviewContext,
} from '../../data/import/importValidator';
import { extractPage } from '../../data/import/screenshotImporter';
import { attachOrphan, groupPages, type GroupingResult } from '../../data/import/sessionGrouper';
import type { LoadMode } from '../../domain/strength/strength';
import { DraftReview } from './DraftReview';
import { lastSetFor } from './gymStats';

type PageState = { status: 'pending' | 'reading' } | { status: 'ok'; page: ExtractedPage } | { status: 'error'; message: string };

const CONCURRENCY = 3;

export function ImportFlow({ onDone }: { onDone: () => void }) {
  const { db, exercises, gymSessions, bestSets, reload } = useAppData();
  const [hasKey, setHasKey] = useState<boolean>();
  const [step, setStep] = useState<'pick' | 'reading' | 'review' | 'done'>('pick');
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [states, setStates] = useState<PageState[]>([]);
  const [grouping, setGrouping] = useState<GroupingResult>();
  const [drafts, setDrafts] = useState<DraftSession[]>([]);
  const [loadModeAnswers, setLoadModeAnswers] = useState<Map<string, LoadMode>>(new Map());
  const [message, setMessage] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const exById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  useEffect(() => {
    getClaudeSettings(db).then((s) => setHasKey(Boolean(s?.apiKey)));
  }, [db]);

  const ctx: ReviewContext = {
    exercises: exById,
    loadModeAnswers,
    lastWeight: (id, before) => lastSetFor(id, gymSessions, bestSets, before)?.weightKg,
  };

  async function start(files: File[]) {
    setMessage(undefined);
    const settings = await getClaudeSettings(db);
    if (!settings?.apiKey) return setMessage('Añade tu API key de Anthropic en Ajustes para leer capturas.');
    setStep('reading');
    let pages: PreparedImage[];
    try {
      pages = await filesToPages(files);
    } catch (e) {
      setStep('pick');
      return setMessage(`No se pudieron abrir los archivos: ${e instanceof Error ? e.message : String(e)}`);
    }
    setImages(pages);
    const results: PageState[] = pages.map(() => ({ status: 'pending' }));
    setStates([...results]);

    const cfg = { apiKey: settings.apiKey, model: settings.model || DEFAULT_MODEL };
    let next = 0;
    let fatal: ClaudeError | undefined;
    const worker = async () => {
      while (next < pages.length && !fatal) {
        const i = next++;
        results[i] = { status: 'reading' };
        setStates([...results]);
        try {
          results[i] = { status: 'ok', page: await extractPage(cfg, pages[i]!) };
        } catch (e) {
          // Auth / quota problems affect every page: stop instead of failing them one by one.
          if (e instanceof ClaudeError && (e.kind === 'auth' || e.kind === 'rate' || e.kind === 'network')) fatal = e;
          results[i] = { status: 'error', message: e instanceof Error ? e.message : String(e) };
        }
        setStates([...results]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pages.length) }, worker));
    if (fatal) {
      setStep('pick');
      return setMessage(fatal.message);
    }
    const okPages = results.map((r) => (r.status === 'ok' ? r.page : { kind: 'other' as const, has_header: false, header: null, exercises: [] }));
    const g = groupPages(okPages);
    setGrouping(g);
    setDrafts(buildDrafts(g.sessions, exercises, gymSessions));
    setStep('review');
  }

  function attach(pageIndex: number, sessionKey: string) {
    if (!grouping) return;
    const okPages = states.map((r) => (r.status === 'ok' ? r.page : { kind: 'other' as const, has_header: false, header: null, exercises: [] }));
    const g: GroupingResult = { sessions: grouping.sessions.map((s) => structuredClone(s)), orphans: [...grouping.orphans] };
    if (sessionKey === '__discard') g.orphans = g.orphans.filter((i) => i !== pageIndex);
    else attachOrphan(g, okPages, pageIndex, sessionKey);
    setGrouping(g);
    // Rebuild only the affected draft, keeping the user's answers on the others.
    const rebuilt = buildDrafts(g.sessions, exercises, gymSessions);
    setDrafts((ds) => rebuilt.map((r) => (r.key === sessionKey ? r : (ds.find((d) => d.key === r.key) ?? r))));
  }

  async function save() {
    const included = drafts.filter((d) => d.include);
    const sessions = included.map((d) => draftToSession(d, ctx));
    const changed = new Map<string, Exercise>();
    const touch = (id: string) => {
      const base = changed.get(id) ?? exById.get(id);
      if (base) changed.set(id, { ...base });
      return changed.get(id);
    };
    for (const d of included) {
      for (const [id, aliases] of learnedAliases(d, ctx)) {
        const ex = touch(id);
        if (ex) ex.aliases = [...new Set([...ex.aliases, ...aliases])];
      }
      for (const e of d.exercises) {
        const ex = e.exerciseId ? touch(e.exerciseId) : undefined;
        if (!ex) continue;
        const answered = loadModeAnswers.get(ex.id);
        if (answered) ex.loadMode = answered;
        if (ex.loadMode === 'perDumbbell') ex.symmetryLogsPair = e.loggedAsPair;
      }
    }
    // Only write exercises that really changed.
    const toSave = [...changed.values()].filter((e) => JSON.stringify(e) !== JSON.stringify(exById.get(e.id)));
    await saveGymSessions(db, sessions);
    if (toSave.length > 0) await saveExercises(db, toSave);
    await reload();
    setMessage(`${sessions.length} sesiones guardadas.${sessions.some((s) => s.needsReview) ? ' Alguna queda marcada para revisar.' : ''}`);
    setStep('done');
  }

  const failed = states.map((s, i) => ({ s, i })).filter((x) => x.s.status === 'error');
  const done = states.filter((s) => s.status === 'ok' || s.status === 'error').length;
  const allReady = drafts.every((d) => isReady(d, ctx)) && (grouping?.orphans.length ?? 0) === 0;

  return (
    <div className="page">
      <header className="page-header">
        <button className="link-btn" onClick={onDone}>
          ‹ Volver
        </button>
        <h1>Importar capturas</h1>
      </header>

      {step === 'pick' && (
        <section className="card">
          <p>Elige las capturas de "Detalle de Entrenamiento" de Symmetry (varias a la vez) o un PDF con ellas.</p>
          <p className="metric-hint">
            Da igual el orden y que se solapen: se agrupan por la cabecera de cada sesión. Antes de guardar podrás revisarlo todo.
          </p>
          {hasKey === false && <p className="status error">Primero añade tu API key de Anthropic en Ajustes → Claude.</p>}
          <button className="btn primary" disabled={hasKey === false} onClick={() => fileRef.current?.click()}>
            Elegir capturas o PDF
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) void start(files);
            }}
          />
          {message && <p className="status error">{message}</p>}
        </section>
      )}

      {step === 'reading' && (
        <section className="card">
          <h2>Leyendo capturas… {states.length > 0 && `${done}/${states.length}`}</h2>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${states.length ? (done / states.length) * 100 : 5}%` }} />
          </div>
          <p className="metric-hint">Cada captura tarda unos segundos. No cierres la app.</p>
        </section>
      )}

      {step === 'review' && grouping && (
        <>
          {failed.length > 0 && (
            <section className="card">
              <h2>No se pudieron leer {failed.length} capturas</h2>
              <div className="thumbs">
                {failed.map(({ s, i }) => (
                  <figure key={i}>
                    <img src={images[i]?.previewUrl} alt={images[i]?.label} />
                    <figcaption>{s.status === 'error' ? s.message : ''}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="metric-hint">Puedes registrar esas sesiones a mano desde Gimnasio → Registrar.</p>
            </section>
          )}

          {grouping.orphans.map((pageIndex) => (
            <section className="card" key={`orphan-${pageIndex}`}>
              <h2>¿A qué sesión pertenece esta captura?</h2>
              <p className="metric-hint">No tiene cabecera y no sigue a ninguna otra captura.</p>
              <div className="thumbs">
                <figure>
                  <img src={images[pageIndex]?.previewUrl} alt={images[pageIndex]?.label} />
                </figure>
              </div>
              <select defaultValue="" onChange={(e) => e.target.value && attach(pageIndex, e.target.value)}>
                <option value="">Elige…</option>
                {grouping.sessions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.date} · {s.name}
                  </option>
                ))}
                <option value="__discard">Ninguna (descartar)</option>
              </select>
            </section>
          ))}

          {drafts.length === 0 && (
            <section className="card">
              <p>No se encontró ninguna sesión en las capturas.</p>
            </section>
          )}

          {drafts.map((d, i) => (
            <DraftReview
              key={d.key}
              draft={d}
              ctx={ctx}
              images={images}
              onChange={(nd) => setDrafts((ds) => ds.map((x, j) => (j === i ? nd : x)))}
              onLoadMode={(id, mode) => setLoadModeAnswers((m) => new Map(m).set(id, mode))}
            />
          ))}

          <div className="row-gap" style={{ marginBottom: 20 }}>
            <button className="btn primary" disabled={!allReady || drafts.every((d) => !d.include)} onClick={save}>
              Guardar {drafts.filter((d) => d.include).length} sesiones
            </button>
            {!allReady && <span className="metric-hint">Responde las preguntas marcadas para poder guardar.</span>}
          </div>
        </>
      )}

      {step === 'done' && (
        <section className="card">
          <p className="status ok">{message}</p>
          <div className="row-gap">
            <button className="btn primary" onClick={onDone}>
              Ver sesiones
            </button>
            <button
              className="btn"
              onClick={() => {
                setStep('pick');
                setDrafts([]);
                setStates([]);
                setImages([]);
                setMessage(undefined);
              }}
            >
              Importar más
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
