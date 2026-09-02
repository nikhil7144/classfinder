import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "isPublic";

/**
 * Marks a route as readable without an account.
 *
 * Opt-in, never the default: AuthGuard is applied globally, so forgetting
 * this decorator makes an endpoint private, which is the safe direction to
 * fail in.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
