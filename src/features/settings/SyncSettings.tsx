import { useState } from 'react';
import { useAppData } from '../../app/AppData';
import { saveSyncConfig } from '../../data/sync/syncClient';

const timeFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function SyncSettings() {
  const { db, cloud, reload } = useAppData();
  const [url, setUrl] = useState(cloud.config?.url ?? '');
  const [token, setToken] = useState('');
  const [editing, setEditing] = useState(!cloud.config);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    await saveSyncConfig(db, { url, token });
    setToken('');
    setEditing(false);
    await reload();
    await cloud.run();
  }

  async function disconnect() {
    if (!confirm('Este dispositivo dejará de sincronizarse. Los datos locales se conservan. ¿Continuar?')) return;
    await saveSyncConfig(db, null);
    setEditing(true);
    await reload();
  }

  const state = cloud.state;

  return (
    <section className="card">
      <h2>Sincronización</h2>
      <p className="metric-hint">
        Mantiene iguales el iPhone y el ordenador mediante tu servidor de Cloudflare. El atajo también puede
        enviar los datos de Salud directamente.
      </p>

      {cloud.config && !editing && (
        <>
          <p className="status">
            {cloud.running
              ? 'Sincronizando…'
              : state?.lastError
                ? `⚠️ ${state.lastError}`
                : state?.lastOkMs
                  ? `✓ Sincronizado ${timeFmt.format(new Date(state.lastOkMs))}`
                  : 'Pendiente de la primera sincronización.'}
          </p>
          <p className="metric-hint">Servidor: {cloud.config.url}</p>
          <div className="row-gap">
            <button className="btn primary" disabled={cloud.running} onClick={() => cloud.run()}>
              Sincronizar ahora
            </button>
            <button className="btn" onClick={() => setEditing(true)}>
              Cambiar
            </button>
            <button className="btn" onClick={disconnect}>
              Desconectar
            </button>
          </div>
        </>
      )}

      {editing && (
        <form className="form" onSubmit={connect}>
          <label>
            Dirección del servidor
            <input
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="https://fitplan-sync.….workers.dev"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </label>
          <label>
            Clave de sincronización
            <input
              type="password"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </label>
          <div className="row-gap">
            <button className="btn primary" type="submit">
              Conectar
            </button>
            {cloud.config && (
              <button className="btn" type="button" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
