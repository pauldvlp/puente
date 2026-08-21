import { Controller, Get } from '@nestjs/common';
import type { ApiToken } from '@puente/shared';
import { MinRole } from './min-role.decorator';
import { ApiTokenService } from './api-token.service';

@Controller('api-tokens')
export class ApiTokenController {
  constructor(private readonly tokens: ApiTokenService) {}

  /**
   * Free: seeing which tokens can reach your panel — and when each was last used — is security
   * hygiene, not a feature. Creating them is Pro; see ee/tokens.
   */
  @MinRole('owner')
  @Get()
  list(): ApiToken[] {
    return this.tokens.list();
  }
}
