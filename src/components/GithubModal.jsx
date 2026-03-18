import { useState } from 'react';
import { getGithubConfig, saveGithubConfig, clearGithubConfig } from '../lib/github';

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, backdropFilter: 'blur(4px)',
  },
  modal: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '2rem', width: 420, maxWidth: '90vw',
    display: 'flex', flexDirection: 'column', gap: '1rem',
  },
  title: { fontFamily: 'var(--font-sans)', fontSize: '1rem', fontWeight: 600, color: 'var(--text)' },
  label: { fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 },
  input: {
    width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
    color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
    padding: '0.5rem 0.75rem', borderRadius: 4, outline: 'none',
  },
  row: { display: 'flex', gap: '0.5rem' },
  btn: {
    flex: 1, padding: '0.5rem', border: '1px solid var(--border)',
    background: 'transparent', color: 'var(--text)', cursor: 'pointer',
    borderRadius: 4, fontFamily: 'var(--font-sans)', fontSize: '0.85rem',
  },
  btnAccent: {
    flex: 1, padding: '0.5rem', border: 'none',
    background: 'var(--accent)', color: '#0f0f0f', cursor: 'pointer',
    borderRadius: 4, fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600,
  },
  hint: { fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 },
};

export default function GithubModal({ onClose }) {
  const existing = getGithubConfig();
  const [token, setToken] = useState(existing?.token ?? '');
  const [owner, setOwner] = useState(existing?.owner ?? '');
  const [repo, setRepo] = useState(existing?.repo ?? '');
  const [path, setPath] = useState(existing?.path ?? '');
  const [status, setStatus] = useState('');

  function handleSave() {
    if (!token || !owner || !repo) { setStatus('Token, owner, and repo are required.'); return; }
    saveGithubConfig({ token, owner, repo, path: path || '' });
    onClose(true);
  }

  function handleClear() {
    clearGithubConfig();
    onClose(false);
  }

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose(false)}>
      <div style={s.modal}>
        <div style={s.title}>GitHub Sync</div>

        <div>
          <label style={s.label}>Personal Access Token</label>
          <input style={s.input} type="password" value={token}
            onChange={e => setToken(e.target.value)} placeholder="ghp_…" />
        </div>
        <div style={s.row}>
          <div style={{ flex: 1 }}>
            <label style={s.label}>Owner</label>
            <input style={s.input} value={owner}
              onChange={e => setOwner(e.target.value)} placeholder="username" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={s.label}>Repo</label>
            <input style={s.input} value={repo}
              onChange={e => setRepo(e.target.value)} placeholder="notes" />
          </div>
        </div>
        <div>
          <label style={s.label}>Path (optional)</label>
          <input style={s.input} value={path}
            onChange={e => setPath(e.target.value)} placeholder="docs/" />
        </div>
        <p style={s.hint}>
          Token needs <code>repo</code> scope. Stored in localStorage — never sent anywhere except api.github.com.
        </p>
        {status && <p style={{ ...s.hint, color: '#e07070' }}>{status}</p>}
        <div style={s.row}>
          {existing && <button style={s.btn} onClick={handleClear}>Disconnect</button>}
          <button style={s.btn} onClick={() => onClose(false)}>Cancel</button>
          <button style={s.btnAccent} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
