import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SupabaseService } from "../supabase/supabase.service";
import { IS_PUBLIC } from "./public.decorator";

/**
 * Applied globally, so a route is private unless it says otherwise.
 *
 * On a @Public() route a token is still read when one is present: the guest
 * city feed does not require an account, but a signed-in visitor who lands on
 * the homepage should be recognised rather than deliberately anonymised.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException("Sign in to use this endpoint.");
    }

    const user = await this.supabase.userFromToken(token);
    if (!user) {
      // A bad token on a public route is not a reason to refuse the page —
      // it is a signed-out visitor with a stale session.
      if (isPublic) return true;
      throw new UnauthorizedException("That session is no longer valid.");
    }

    request.caller = { id: user.id, accessToken: token };
    return true;
  }
}
