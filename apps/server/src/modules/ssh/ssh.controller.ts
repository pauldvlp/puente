import { Controller, Get } from '@nestjs/common';
import type { SshConfigHost, SshKey } from '@puente/shared';
import { SshService } from './ssh.service';

@Controller('ssh')
export class SshController {
  constructor(private readonly ssh: SshService) {}

  /** Host aliases parsed from the operator's ~/.ssh/config (to prefill node forms). */
  @Get('config-hosts')
  configHosts(): Promise<SshConfigHost[]> {
    return this.ssh.parseUserSshConfig();
  }

  /** puente-managed SSH key pairs. */
  @Get('keys')
  keys(): Promise<SshKey[]> {
    return this.ssh.listManagedKeys();
  }
}
