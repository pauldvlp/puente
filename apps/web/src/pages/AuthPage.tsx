import { useState, type FormEvent } from 'react';
import { Cloud } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { errMessage } from '../lib/hooks';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Field } from '../components/ui/extras';
import { Card } from '../components/ui/card';
import { ThemeToggle } from '../components/theme';

export function AuthPage({ hasAdmin }: { hasAdmin: boolean }) {
  const { login, register } = useAuth();
  const isRegister = !hasAdmin;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <Cloud className="size-6" />
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

            {error && <div className="text-sm font-medium text-destructive">{error}</div>}

            <Button size="lg" type="submit" loading={loading} className="mt-1 w-full">
              {isRegister ? 'Create account' : 'Sign in'}
            </Button>
          </form>
        </Card>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Self-hosted · your data never leaves this machine
        </p>
      </div>
    </div>
  );
}
