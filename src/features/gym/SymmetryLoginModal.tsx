import { useState } from 'react';
import {
  getStoredSymmetryAuth,
  isSymmetryConnected,
  loginToSymmetry,
  logoutSymmetry,
  type SymmetryAuth,
} from '../../data/symmetry/symmetryApi';

interface SymmetryLoginModalProps {
  onClose: () => void;
  onAuthChange?: (auth: SymmetryAuth | null) => void;
}

export function SymmetryLoginModal({ onClose, onAuthChange }: SymmetryLoginModalProps) {
  const [auth, setAuth] = useState<SymmetryAuth | null>(() => getStoredSymmetryAuth());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const connected = isSymmetryConnected();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Introduce tu correo y contraseña de Symmetry');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const res = await loginToSymmetry(email.trim(), password);
    setLoading(false);

    if (!res.ok || !res.auth) {
      setError(res.error || 'Error al iniciar sesión en Symmetry');
      return;
    }

    setAuth(res.auth);
    setSuccess('¡Conectado con éxito a Symmetry Cloud!');
    onAuthChange?.(res.auth);
  }

  function handleLogout() {
    logoutSymmetry();
    setAuth(null);
    setSuccess(null);
    setError(null);
    onAuthChange?.(null);
  }

  return (
    <div className="sym-modal-overlay" onClick={onClose}>
      <div className="sym-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="sym-modal-header">
          <h2 className="sym-modal-title">
            <span
              style={{
                width: 24,
                height: 24,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
                borderRadius: 6,
              }}
            >
              <img
                src="/symmetry/icons/symmetry_logo.svg"
                alt="Symmetry"
                style={{ width: 14, height: 14 }}
              />
            </span>
            Conexión con Symmetry
          </h2>
          <button className="sym-modal-close-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="sym-modal-body">
          <div className="sym-alert-box info">
            <strong>Experiencia Symmetry Desbloqueada</strong>
            <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.9 }}>
              Conecta tu cuenta de Symmetry para enviar tus entrenamientos directamente a sus
              servidores sin límites de rutinas ni bloqueos de suscripción.
            </p>
          </div>

          {error && <div className="sym-alert-box error">{error}</div>}
          {success && <div className="sym-alert-box success">{success}</div>}

          {connected && auth ? (
            <div>
              <div
                style={{
                  background: 'var(--sym-card)',
                  borderRadius: 12,
                  padding: 16,
                  border: '1px solid var(--sym-border)',
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: 'var(--sym-emerald)',
                      boxShadow: '0 0 8px var(--sym-emerald)',
                    }}
                  />
                  <strong style={{ color: '#ffffff' }}>Conectado como</strong>
                </div>
                <div style={{ color: 'var(--sym-blue)', fontFamily: 'DM Mono, monospace', fontSize: 14 }}>
                  {auth.email || 'Usuario Symmetry'}
                </div>
                {auth.lastConnectedAt && (
                  <div style={{ color: 'var(--sym-text-muted)', fontSize: 11, marginTop: 4 }}>
                    Conectado el {new Date(auth.lastConnectedAt).toLocaleString('es-ES')}
                  </div>
                )}
              </div>

              <button
                type="button"
                className="sym-btn-secondary"
                style={{ width: '100%', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171' }}
                onClick={handleLogout}
              >
                Desconectar cuenta
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin}>
              <div className="sym-form-group">
                <label className="sym-form-label" htmlFor="sym-email">
                  Correo electrónico
                </label>
                <input
                  id="sym-email"
                  type="email"
                  className="sym-form-input"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="sym-form-group">
                <label className="sym-form-label" htmlFor="sym-password">
                  Contraseña de Symmetry
                </label>
                <input
                  id="sym-password"
                  type="password"
                  className="sym-form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                className="sym-btn-primary"
                style={{ width: '100%', marginTop: 8 }}
                disabled={loading}
              >
                {loading ? 'Conectando...' : 'Conectar con Symmetry'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
