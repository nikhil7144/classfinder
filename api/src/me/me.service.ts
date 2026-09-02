import { Injectable } from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import { MeDto } from "./dto/me.dto";

@Injectable()
export class MeService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Who is asking, and what they have finished.
   *
   * The web app reads `profiles` from twenty-six places to answer some part of
   * this — mostly "what is my role" before deciding what to render. A mobile
   * client asks the same question once at launch and needs a single call for
   * it, not three tables and a rule about which to look at.
   *
   * Read as the caller: "read own profile", "read own seeker row" and "owner
   * read own provider row" each cover their part exactly, so there is no
   * privilege here that the browser did not already have.
   */
  async get(caller: Caller): Promise<MeDto> {
    const db = this.supabase.asUser(caller.accessToken);

    const { data: profile } = await db
      .from("profiles")
      .select("role, profile_complete, phone")
      .eq("id", caller.id)
      .maybeSingle();

    // No row yet is a real, expected state, not an error: the account exists
    // the moment the email is verified, and the role is chosen after that.
    // Callers branch on it to send someone to /choose-role.
    if (!profile) {
      return { id: caller.id, role: null, profileComplete: false, phone: null };
    }

    const base: MeDto = {
      id: caller.id,
      role: profile.role,
      profileComplete: profile.profile_complete,
      phone: profile.phone ?? null,
    };

    if (profile.role === "seeker") {
      const { data: seeker } = await db
        .from("seekers")
        .select("name, photo_url, area_id, looking_for, open_to_offers")
        .eq("user_id", caller.id)
        .maybeSingle();

      return {
        ...base,
        seeker: seeker
          ? {
              name: seeker.name,
              photoUrl: seeker.photo_url,
              areaId: seeker.area_id,
              lookingFor: seeker.looking_for ?? [],
              openToOffers: seeker.open_to_offers,
            }
          : null,
      };
    }

    if (profile.role === "provider") {
      const { data: provider } = await db
        .from("providers")
        .select("id, display_name, photo_url, provider_type, approved, is_suspended")
        .eq("user_id", caller.id)
        .maybeSingle();

      return {
        ...base,
        provider: provider
          ? {
              id: provider.id,
              displayName: provider.display_name,
              photoUrl: provider.photo_url,
              providerType: provider.provider_type,
              // Both reported, because they mean different things to a coach:
              // not yet approved is waiting, suspended is a decision.
              approved: provider.approved,
              isSuspended: provider.is_suspended,
            }
          : null,
      };
    }

    return base;
  }
}
