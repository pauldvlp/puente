import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';

type Theme = 'light' | 'dark';
const KEY = 'puente_theme';

function initial(): Theme {
  const stored = localStorage.getItem(KEY) as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

/** Call once on app boot to apply the persisted theme before first paint. */
export function bootTheme(): void {
  apply(initial());
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    apply(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full text-muted-foreground"
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
