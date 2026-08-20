import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import {
  ActivateLicenseSchema,
  type ActivateLicenseInput,
  type LicenseStatus,
} from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
import { LicenseService } from './license.service';

@Controller('license')
export class LicenseController {
  constructor(private readonly licenses: LicenseService) {}

  /** Current edition and what it unlocks. Every signed-in user may read this. */
  @Get()
  status(): LicenseStatus {
    return this.licenses.status();
  }

  @Post()
  activate(@Body(new ZodBody(ActivateLicenseSchema)) dto: ActivateLicenseInput): LicenseStatus {
    return this.licenses.activate(dto.key);
  }

  @Delete()
  deactivate(): LicenseStatus {
    return this.licenses.deactivate();
  }
}
