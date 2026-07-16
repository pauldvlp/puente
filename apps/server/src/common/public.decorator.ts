import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'puente:isPublic';

/** Marks a route as accessible without an authenticated session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
