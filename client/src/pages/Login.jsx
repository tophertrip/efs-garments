import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Button } from '../components';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function press(d) {
    setError('');
    if (pin.length < 8) setPin(pin + d);
  }
  function back() { setPin(pin.slice(0, -1)); }

  async function submit(value) {
    const code = value ?? pin;
    if (!code) return;
    setBusy(true);
    setError('');
    try {
      await login(code);
      navigate('/');
    } catch (e) {
      setError(e.message || 'Login failed');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gold text-navy text-2xl font-extrabold mb-4">
            EFS
          </div>
          <h1 className="text-2xl font-extrabold text-white">EFS Garments Manufacturing</h1>
          <p className="text-gray-300 text-sm mt-1">Production Tracker — enter your PIN</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex justify-center gap-3 mb-5 h-6">
            {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
              <span key={i} className={`h-3 w-3 rounded-full ${i < pin.length ? 'bg-navy' : 'bg-gray-200'}`} />
            ))}
          </div>

          {error && <p className="text-center text-red-600 text-sm mb-3">{error}</p>}

          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                onClick={() => press(String(n))}
                className="h-14 rounded-xl bg-cloud hover:bg-gray-200 text-xl font-bold text-navy transition"
              >
                {n}
              </button>
            ))}
            <button onClick={back} className="h-14 rounded-xl hover:bg-gray-100 text-lg text-gray-500">⌫</button>
            <button onClick={() => press('0')} className="h-14 rounded-xl bg-cloud hover:bg-gray-200 text-xl font-bold text-navy transition">0</button>
            <button onClick={() => submit()} disabled={busy} className="h-14 rounded-xl bg-gold hover:bg-gold-dark text-navy font-bold transition">
              {busy ? '…' : '→'}
            </button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="mt-4">
            <Button type="submit" variant="primary" className="w-full" disabled={busy || !pin}>
              {busy ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6 leading-relaxed">
          This system is intended exclusively for authorized personnel of EFS Garments Manufacturing.
        </p>
      </div>
    </div>
  );
}
