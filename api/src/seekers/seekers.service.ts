import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import { MySeekerDto, SaveSeekerProfileDto } from "./dto/seeker.dto";

type Row = {
  id: string;
  name: string | null;
  relation_to_learner: string | null;
  area_id: string | null;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
  looking_for: string[] | null;
  learner_age: number | null;
  level: string | null;
  preferred_modes: string[] | null;
  preferred_days: string[] | null;
  preferred_time: string | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_period: string | null;
  requirement_notes: string | null;
  open_to_offers: boolean | null;
  marketing_opt_in: boolean | null;
  requirement_updated_at: string | null;
};

const COLUMNS =
  "id, name, relation_to_learner, area_id, lat, lng, photo_url, looking_for, learner_age, " +
  "level, preferred_modes, preferred_days, preferred_time, budget_min, budget_max, " +
  "budget_period, requirement_notes, open_to_offers, marketing_opt_in, requirement_updated_at";

const toDto = (r: Row, profileComplete: boolean): MySeekerDto => ({
  id: r.id,
  name: r.name,
  relationToLearner: r.relation_to_learner,
  areaId: r.area_id,
  lat: r.lat,
  lng: r.lng,
  photoUrl: r.photo_url,
  lookingFor: r.looking_for ?? [],
  learnerAge: r.learner_age,
  level: r.level,
  preferredModes: r.preferred_modes ?? [],
  preferredDays: r.preferred_days ?? [],
  preferredTime: r.preferred_time,
  budgetMin: r.budget_min,
  budgetMax: r.budget_max,
  budgetPeriod: r.budget_period,
  requirementNotes: r.requirement_notes,
  // Both columns are NOT NULL with defaults, so these coalesces are for a row
  // read back through an older client rather than for the database.
  openToOffers: r.open_to_offers ?? true,
  marketingOptIn: r.marketing_opt_in ?? false,
  requirementUpdatedAt: r.requirement_updated_at,
  profileComplete,
});

@Injectable()
export class SeekersService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * The caller's own profile.
   *
   * Read as the caller under "read own seeker row", so there is no ownership
   * check here to get wrong. 404 for a family who has not started one is the
   * expected state and not an error: the account exists from the moment a role
   * is chosen, and the row is written by the first save.
   *
   * profile_complete lives on profiles rather than here, so it is a second
   * read — done in parallel, because neither depends on the other.
   */
  async mine(caller: Caller): Promise<MySeekerDto> {
    const db = this.supabase.asUser(caller.accessToken);

    const [{ data: seeker }, { data: profile }] = await Promise.all([
      db.from("seekers").select(COLUMNS).eq("user_id", caller.id).maybeSingle(),
      db.from("profiles").select("profile_complete").eq("id", caller.id).maybeSingle(),
    ]);

    if (!seeker) throw new NotFoundException("You have not filled in your profile yet.");

    return toDto(
      seeker as unknown as Row,
      (profile as { profile_complete: boolean } | null)?.profile_complete ?? false,
    );
  }

  /**
   * The whole profile, in one call and one transaction.
   *
   * Not a patch: save_seeker_profile() upserts the row, so a partial payload
   * would clear whatever it left out. The web does this as an upsert plus a
   * separate profile_complete update, which is the same two-writes-should-be-one
   * shape phase3o fixed for coaches.
   *
   * The payload is snake_cased here rather than in the function, so the
   * contract stays camelCase like every other endpoint and the SQL stays
   * readable against the columns it writes.
   */
  async save(caller: Caller, body: SaveSeekerProfileDto): Promise<MySeekerDto> {
    const db = this.supabase.asUser(caller.accessToken);

    const { error } = await db.rpc("save_seeker_profile", {
      p_profile: {
        name: body.name.trim(),
        relation_to_learner: body.relationToLearner,
        area_id: body.areaId,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        photo_url: body.photoUrl ?? null,
        looking_for: body.lookingFor ?? [],
        learner_age: body.learnerAge ?? null,
        level: body.level ?? null,
        preferred_modes: body.preferredModes ?? [],
        preferred_days: body.preferredDays ?? [],
        preferred_time: body.preferredTime ?? null,
        budget_min: body.budgetMin ?? null,
        budget_max: body.budgetMax ?? null,
        budget_period: body.budgetPeriod ?? null,
        requirement_notes: body.requirementNotes?.trim() || null,
        open_to_offers: body.openToOffers ?? true,
        marketing_opt_in: body.marketingOptIn ?? false,
      },
    });

    if (error) {
      // The function raises sentences worth showing: "Sign in first.", "This
      // account is not a family account."
      if (error.code === "P0001") throw new BadRequestException(error.message);
      // phase3r's trigger, if it is somehow reached first.
      if (error.code === "23514") throw new BadRequestException(error.message);
      throw new InternalServerErrorException(error.message);
    }

    // Read back through the same call every client uses, so what comes back is
    // the whole picture rather than the fields that happened to be sent.
    return this.mine(caller);
  }
}
