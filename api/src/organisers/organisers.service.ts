import { ForbiddenException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import { OrganiserDto, UpdateOrganiserDto } from "./dto/organiser.dto";

type Row = {
  id: string;
  name: string | null;
  about: string | null;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  area_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  approved: boolean;
  is_suspended: boolean;
};

const toDto = (r: Row): OrganiserDto => ({
  id: r.id,
  name: r.name,
  about: r.about,
  logoUrl: r.logo_url,
  contactEmail: r.contact_email,
  contactPhone: r.contact_phone,
  websiteUrl: r.website_url,
  areaId: r.area_id,
  venueName: r.venue_name,
  venueAddress: r.venue_address,
  approved: r.approved,
  isSuspended: r.is_suspended,
});

const COLUMNS =
  "id, name, about, logo_url, contact_email, contact_phone, website_url, area_id, venue_name, venue_address, approved, is_suspended";

@Injectable()
export class OrganisersService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * The caller's own listing, or null before they have made one.
   *
   * Read as the caller, and that is the whole access control: phase3e's
   * "owner read own organiser row" is unconditional on approval, so a company
   * waiting on an admin still sees what it submitted. That policy is also why
   * the migration has no read function — a definer wrapper around a query RLS
   * already permits is a privilege nobody needs.
   */
  async mine(caller: Caller): Promise<OrganiserDto | null> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .from("organisers")
      .select(COLUMNS)
      .eq("user_id", caller.id)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    return data ? toDto(data as Row) : null;
  }

  /**
   * Create or update it. One row per user, so this is an upsert on user_id.
   *
   * Nothing here checks whether the caller may write: the insert policy
   * requires role = 'organiser' and refuses a row that arrives pre-approved,
   * and the column grant refuses an update that so much as names `approved`.
   * A check in this method would be a second copy of a rule that already
   * holds, and copies drift.
   */
  async save(caller: Caller, body: UpdateOrganiserDto): Promise<OrganiserDto> {
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.about !== undefined) patch.about = body.about;
    if (body.logoUrl !== undefined) patch.logo_url = body.logoUrl;
    if (body.contactEmail !== undefined) patch.contact_email = body.contactEmail;
    if (body.contactPhone !== undefined) patch.contact_phone = body.contactPhone;
    if (body.websiteUrl !== undefined) patch.website_url = body.websiteUrl;
    if (body.areaId !== undefined) patch.area_id = body.areaId;
    if (body.venueName !== undefined) patch.venue_name = body.venueName;
    if (body.venueAddress !== undefined) patch.venue_address = body.venueAddress;

    const db = this.supabase.asUser(caller.accessToken);
    const existing = await this.mine(caller);

    const { data, error } = existing
      ? await db.from("organisers").update(patch).eq("user_id", caller.id).select(COLUMNS).single()
      : await db
          .from("organisers")
          .insert({ ...patch, user_id: caller.id })
          .select(COLUMNS)
          .single();

    if (error) {
      // 42501 is insufficient_privilege, which here means the request tried to
      // write a column the grant withholds — approval, in practice. Reported
      // as a refusal rather than a server fault, because it is one.
      if (error.code === "42501") {
        throw new ForbiddenException("That isn't yours to change.");
      }
      throw new InternalServerErrorException(error.message);
    }

    return toDto(data as Row);
  }
}
