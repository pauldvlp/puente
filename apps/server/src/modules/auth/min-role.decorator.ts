import { SetMetadata } from '@nestjs/common';
import type { Role } from '@puente/shared';

export const MIN_ROLE_KEY = 'puente:min-role';

/**
 * The lowest role allowed to call this handler.
 *
 * Only needed to *raise* the bar. Without it, reads are open to any signed-in account and writes
 * require an operator — see {@link RolesGuard}. That default is deliberate: a new endpoint should
 * be safe because nobody remembered it, not unsafe.
 */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE_KEY, role);
