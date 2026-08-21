import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PuenteMark } from '../components/PuenteMark';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errMessage } from '../lib/hooks';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Field } from '../components/ui/extras';
import { Card } from '../components/ui/card';
import { ThemeToggle } from '../components/theme';
import { Building2 } from 'lucide-react';
import { API_PREFIX, type SsoStatus } from '@puente/shared';

export function AuthPage({ hasAdmin }: { hasAdmin: boolean }) {
  const { login, register, completeSso } = useAuth();
  const isRegister = !hasAdmin;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sso, setSso] = useState<SsoStatus | null>(null);
  const [params, setParams] = useSearchParams();
  const redeemed = useRef(false);

  // Whether to offer the button at all. Public endpoint — nobody is signed in yet. A failure here
  // is not worth showing: the password form below still works.
  useEffect(() => {
    let live = true;
    api.sso
      .status()
      .then((s) => live && setSso(s))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // What the provider sent us back with. The refusal is read straight off the URL rather than
  // copied into state — there is nothing to synchronise, and a refresh should still explain
  // itself.
  const refused = params.get('sso_error');
  const handoff = params.get('sso');

  // The callback put a one-time code in the URL rather than the session itself, so nothing that
  // lands in browser history or a proxy log is worth stealing.
  useEffect(() => {
    if (!handoff || redeemed.current) return;
    redeemed.current = true;
    // Drop it from the URL first: a code is single-use, so a refresh must not try to spend it
    // again and report a failure that already succeeded.
    setParams({}, { replace: true });
    void (async () => {
      setLoading(true);
      try {
        await completeSso(handoff);
      } catch (err) {
        setError(errMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [handoff, setParams, completeSso]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isRegister) {
        await register({ username, password, confirmPassword: confirm });
      } else {
        await login({ username, password });
      }
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="fixed right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[420px]">
        <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/30">
          <PuenteMark className="size-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isRegister ? 'Welcome to puente' : 'Welcome back'}
        </h1>
        <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
          {isRegister
            ? 'Create your administrator account to manage your Cloudflare Tunnels.'
            : 'Sign in to your control panel.'}
        </p>

        <Card className="gap-0 p-6">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Username" htmlFor="username">
              <Input
                id="username"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              hint={isRegister ? 'At least 8 characters.' : undefined}
            >
              <Input
                id="password"
                type="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            {isRegister && (
              <Field label="Confirm password" htmlFor="confirm">
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
            )}

            {(error ?? refused) && (
              <div role="alert" className="text-sm font-medium text-destructive">
                {error ?? refused}
              </div>
            )}

            <Button size="lg" type="submit" loading={loading} className="mt-1 w-full">
              {isRegister ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          {sso?.enabled && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              {/* A real navigation, not fetch: the provider has to see the browser. */}
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                onClick={() => {
                  window.location.href = `${API_PREFIX}/sso/start`;
                }}
              >
                <Building2 className="size-4" /> Continue with {sso.label}
              </Button>
            </>
          )}
        </Card>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Self-hosted · your data never leaves this machine
        </p>
      </div>
    </div>
  );
}
