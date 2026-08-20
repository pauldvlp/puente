import { SetMetadata } from '@nestjs/common';
import type { ProFeature } from '@puente/shared';

export const REQUIRES_PRO_KEY = 'puente:requires-pro';

/**
 * Gate a controller or handler behind a Pro feature.
 *
 * Only ever put this on endpoints that live in `ee/`. Gating an AGPL endpoint would take
 * something away from Community that it already had, which is how you turn users into ex-users.
 */
export const RequiresPro = (feature: ProFeature) => SetMetadata(REQUIRES_PRO_KEY, feature);
