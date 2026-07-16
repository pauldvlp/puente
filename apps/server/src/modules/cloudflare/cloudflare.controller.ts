import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ConnectTokenSchema,
  REQUIRED_TOKEN_SCOPES,
  type CloudflareConnection,
  type CloudflareZone,
  type ConnectTokenInput,
} from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
import { CloudflareService } from './cloudflare.service';
import { SettingsService } from '../settings/settings.service';

@Controller('cloudflare')
export class CloudflareController {
  constructor(
    private readonly cloudflare: CloudflareService,
    private readonly settings: SettingsService,
  ) {}

  /** Preview accounts/zones a token can access, WITHOUT saving it. */
  @Post('verify')
  async verify(@Body(new ZodBody(ConnectTokenSchema)) dto: ConnectTokenInput) {
    return this.cloudflare.verifyToken(dto.apiToken);
  }

  /** Connect + persist the token, selecting an account. */
  @Post('connect')
  connect(
    @Body(new ZodBody(ConnectTokenSchema)) dto: ConnectTokenInput,
  ): Promise<CloudflareConnection> {
    return this.cloudflare.connect(dto.apiToken, dto.accountId);
  }

  @Get('connection')
  connection(): CloudflareConnection {
    return this.cloudflare.getConnection();
  }

  @Post('disconnect')
  disconnect(): { ok: true } {
    this.settings.clearCloudflare();
    return { ok: true };
  }

  @Get('zones')
  zones(): CloudflareZone[] {
    return this.settings.getZones();
  }

  @Post('zones/refresh')
  refreshZones(): Promise<CloudflareZone[]> {
    return this.cloudflare.refreshZones();
  }

  /** The exact API-token permission groups the user must select in Cloudflare. */
  @Get('scopes')
  scopes() {
    return { scopes: REQUIRED_TOKEN_SCOPES };
  }
}
