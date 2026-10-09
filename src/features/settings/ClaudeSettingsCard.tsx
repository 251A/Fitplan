import { useEffect, useState } from 'react';
import { useAppData } from '../../app/AppData';
import { createMessage, DEFAULT_MODEL } from '../../data/ai/anthropicClient';
import { getClaudeSettings, saveClaudeSettings } from '../../data/db/repository';

const MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (recomendado)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (más preciso, más caro)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (más barato)' },
];

export function ClaudeSettingsCard() {
  const { db } = useAppData();
  const [hasKey, setHasKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();

  useEffect(() => {
    getClaudeSettings(db).then((s) => {
      setHasKey(Boolean(s?.apiKey));
      if (s?.model) setModel(s.model);
    });
  }, [db]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const current = await getClaudeSettings(db);
    const key = apiKey.trim() || current?.apiKey || '';
    await saveClaudeSettings(db, { apiKey: key, model });
    setApiKey('');
    setHasKey(Boolean(key));
    setStatus({ ok: true, text: 'Guardado.' });
  }

  async function test() {
    const s = await getClaudeSettings(db);
    setStatus({ ok: true, text: 'Probando…' });
    try {
      await createMessage({ apiKey: s?.apiKey ?? '', model: s?.model || DEFAULT_MODEL }, {
        max_tokens: 64,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: 'Responde solo: OK' }],
      });
      setStatus({ ok: true, text: 'Conexión con Claude correcta.' });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <section className="card">
      <h2>Claude</h2>
      <p className="metric-hint">
        Se usa para leer las capturas de Symmetry. La API key se guarda solo en este dispositivo (no se sincroniza) y se envía
        directamente a Anthropic. Sin key, todo lo demás funciona igual.
      </p>
      <form className="form" onSubmit={save}>
        <label>
          API key de Anthropic {hasKey && <span className="status ok">· guardada</span>}
          <input
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            placeholder={hasKey ? 'Déjalo vacío para mantener la actual' : 'sk-ant-…'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        <label>
          Modelo
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div className="row-gap">
          <button className="btn primary" type="submit">
            Guardar
          </button>
          <button className="btn" type="button" disabled={!hasKey} onClick={test}>
            Probar conexión
          </button>
          {hasKey && (
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await saveClaudeSettings(db, undefined);
                setHasKey(false);
                setStatus({ ok: true, text: 'API key borrada de este dispositivo.' });
              }}
            >
              Borrar key
            </button>
          )}
        </div>
        {status && <span className={`status ${status.ok ? 'ok' : 'error'}`}>{status.text}</span>}
      </form>
    </section>
  );
}
