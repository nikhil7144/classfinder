import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/** The caller, as established by AuthGuard. Null on a public route. */
export type Caller = { id: string; accessToken: string };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Caller | null =>
    ctx.switchToHttp().getRequest().caller ?? null,
);
