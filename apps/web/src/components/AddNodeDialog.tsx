import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Laptop, Server } from 'lucide-react';
import type { CreateNodeInput } from '@puente/shared';
import { api } from '../lib/api';
import { qk } from '../lib/query';
import { useNodeMutations } from '../lib/hooks';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field } from './ui/extras';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { cn } from '@/lib/utils';

export function AddNodeDialog({
  open,
  onClose,
  hasLocal,
}: {
  open: boolean;
  onClose: () => void;
  hasLocal: boolean;
}) {
  const [kind, setKind] = useState<'local' | 'ssh'>(hasLocal ? 'ssh' : 'local');
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [keyPath, setKeyPath] = useState('');
  const { create } = useNodeMutations();

  const sshHosts = useQuery({ queryKey: qk.sshHosts, queryFn: api.ssh.configHosts, enabled: open });

  const reset = () => {
    setName('');
    setHost('');
    setPort('22');
    setUsername('');
    setKeyPath('');
  };

  const submit = () => {
    const input: CreateNodeInput =
      kind === 'local'
        ? { kind: 'local', name: name || 'This machine' }
        : {
            kind: 'ssh',
            name: name || host,
            host,
            port: Number(port) || 22,
            username,
            privateKeyPath: keyPath || undefined,
          };
    create.mutate(input, {
      onSuccess: () => {
        reset();
        onClose();
      },
    });
  };

  const applyAlias = (alias: string) => {
    const h = sshHosts.data?.find((x) => x.alias === alias);
    if (!h) return;
    if (h.hostName) setHost(h.hostName);
    if (h.user) setUsername(h.user);
    if (h.port) setPort(String(h.port));
    if (h.identityFile) setKeyPath(h.identityFile);
    if (!name) setName(alias);
  };

  const canSubmit = kind === 'local' ? true : Boolean(host.trim() && username.trim());

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a node</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <KindCard
              active={kind === 'local'}
              disabled={hasLocal}
              icon={<Laptop className="size-5" />}
              title="This machine"
              desc="The computer running puente"
              onClick={() => !hasLocal && setKind('local')}
            />
            <KindCard
              active={kind === 'ssh'}
              icon={<Server className="size-5" />}
              title="Remote (SSH)"
              desc="A server or PC over SSH"
              onClick={() => setKind('ssh')}
            />
          </div>

          <Field label="Name" hint="A friendly label, e.g. “matebook” or “home-server”." htmlFor="node-name">
            <Input
              id="node-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'local' ? 'This machine' : 'matebook'}
            />
          </Field>

          {kind === 'ssh' && (
            <>
              {sshHosts.data && sshHosts.data.length > 0 && (
                <Field label="Use an ~/.ssh/config host" hint="Optional — prefills the fields below.">
                  <Select onValueChange={(v) => applyAlias(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a host alias…" />
                    </SelectTrigger>
                    <SelectContent>
                      {sshHosts.data.map((h) => (
                        <SelectItem key={h.alias} value={h.alias}>
                          {h.alias}
                          {h.hostName ? ` (${h.user ? `${h.user}@` : ''}${h.hostName})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 90px' }}>
                <Field label="Host / IP" htmlFor="ssh-host">
                  <Input id="ssh-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="10.3.165.82" />
                </Field>
                <Field label="Port" htmlFor="ssh-port">
                  <Input id="ssh-port" value={port} onChange={(e) => setPort(e.target.value)} placeholder="22" />
                </Field>
              </div>
              <Field label="SSH username" htmlFor="ssh-user">
                <Input
                  id="ssh-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="pauldvlp"
                />
              </Field>
              <Field
                label="Private key path"
                htmlFor="ssh-key"
                hint="Optional. Leave empty to set up passwordless access after adding (you’ll enter the password once)."
              >
                <Input
                  id="ssh-key"
                  value={keyPath}
                  onChange={(e) => setKeyPath(e.target.value)}
                  placeholder="~/.ssh/id_ed25519"
                />
              </Field>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!canSubmit}>
            Add node
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KindCard({
  active,
  disabled,
  icon,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col gap-1.5 rounded-xl border bg-elevated p-4 text-left transition-all',
        active
          ? 'border-primary ring-2 ring-primary/30'
          : 'hover:border-border hover:bg-accent/40',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className={cn(active ? 'text-primary' : 'text-muted-foreground')}>{icon}</span>
      <span className="font-semibold">{title}</span>
      <span className="text-xs text-muted-foreground">{disabled ? 'Already added' : desc}</span>
    </button>
  );
}
