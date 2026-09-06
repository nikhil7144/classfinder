import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import {
  CreateEventDto,
  EventCategoryDto,
  EventCategoryInputDto,
  EventDto,
  ReplaceEventCategoriesDto,
  UpdateEventDto,
} from "./dto/event.dto";

type CategoryRow = {
  id: string;
  name: string;
  entry_type: "individual" | "team";
  team_size: number | null;
  capacity: number | null;
  entries_count: number;
  fee_amount: number | string | null;
  min_age: number | null;
  max_age: number | null;
  sort_order: number;
};

type EventRow = {
  id: string;
  provider_id: string | null;
  organiser_id: string | null;
  title: string;
  about: string | null;
  service_category_id: string | null;
  banner_url: string | null;
  city_id: string;
  venue_name: string | null;
  venue_address: string | null;
  booking_mode: "platform" | "external" | "none";
  external_booking_url: string | null;
  booking_opens_at: string | null;
  booking_closes_at: string | null;
  cancellation_deadline: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "draft" | "published" | "cancelled" | "completed";
  created_at: string;
  event_categories?: CategoryRow[] | null;
  // Embedded through the two owner foreign keys. Exactly one is ever set,
  // and either can come back null when the caller may not read that row —
  // a suspended company's own draft, for instance.
  organisers?: { name: string | null } | null;
  providers?: { display_name: string | null } | null;
};

const CATEGORY_COLUMNS =
  "id, name, entry_type, team_size, capacity, entries_count, fee_amount, min_age, max_age, " +
  "sort_order";

const EVENT_COLUMNS =
  "id, provider_id, organiser_id, title, about, service_category_id, banner_url, city_id, " +
  "venue_name, venue_address, booking_mode, external_booking_url, booking_opens_at, " +
  "booking_closes_at, cancellation_deadline, starts_at, ends_at, status, created_at";

/**
 * The owner's name comes back embedded rather than fetched per event.
 *
 * A listing of twenty events would otherwise be twenty extra round trips, or
 * a name the page has to look up from an id it cannot resolve — there is no
 * public organiser read, and adding one to name a company on its own event
 * page would be a second door into the same row.
 */
const WITH_CATEGORIES =
  `${EVENT_COLUMNS}, event_categories(${CATEGORY_COLUMNS}), ` +
  `organisers(name), providers(display_name)`;

const toCategoryDto = (r: CategoryRow): EventCategoryDto => ({
  id: r.id,
  name: r.name,
  entryType: r.entry_type,
  teamSize: r.team_size,
  capacity: r.capacity,
  entriesCount: r.entries_count ?? 0,
  // numeric(10,2) arrives from PostgREST as a string, because JavaScript
  // numbers cannot hold every numeric. These are entry fees in rupees, well
  // inside a double, so the client gets a number rather than a type that
  // changes shape depending on which driver fetched it.
  feeAmount: r.fee_amount === null ? null : Number(r.fee_amount),
  minAge: r.min_age,
  maxAge: r.max_age,
  sortOrder: r.sort_order,
});

const toDto = (r: EventRow): EventDto => ({
  id: r.id,
  // Exactly one is set — 3J's check constraint is what makes this total
  // rather than a guess with a fallback.
  ownerKind: r.organiser_id ? "organiser" : "provider",
  ownerId: (r.organiser_id ?? r.provider_id)!,
  ownerName: r.organisers?.name ?? r.providers?.display_name ?? null,
  title: r.title,
  about: r.about,
  serviceCategoryId: r.service_category_id,
  bannerUrl: r.banner_url,
  cityId: r.city_id,
  venueName: r.venue_name,
  venueAddress: r.venue_address,
  bookingMode: r.booking_mode,
  externalBookingUrl: r.external_booking_url,
  bookingOpensAt: r.booking_opens_at,
  bookingClosesAt: r.booking_closes_at,
  cancellationDeadline: r.cancellation_deadline,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  status: r.status,
  createdAt: r.created_at,
  categories: [...(r.event_categories ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map(toCategoryDto),
});

/** Only the keys the caller actually sent, mapped to columns. */
const toPatch = (body: UpdateEventDto): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.about !== undefined) patch.about = body.about;
  if (body.serviceCategoryId !== undefined) patch.service_category_id = body.serviceCategoryId;
  if (body.bannerUrl !== undefined) patch.banner_url = body.bannerUrl;
  if (body.cityId !== undefined) patch.city_id = body.cityId;
  if (body.venueName !== undefined) patch.venue_name = body.venueName;
  if (body.venueAddress !== undefined) patch.venue_address = body.venueAddress;
  if (body.bookingMode !== undefined) patch.booking_mode = body.bookingMode;
  if (body.externalBookingUrl !== undefined) {
    patch.external_booking_url = body.externalBookingUrl;
  }
  if (body.bookingOpensAt !== undefined) patch.booking_opens_at = body.bookingOpensAt;
  if (body.bookingClosesAt !== undefined) patch.booking_closes_at = body.bookingClosesAt;
  if (body.cancellationDeadline !== undefined) {
    patch.cancellation_deadline = body.cancellationDeadline;
  }
  if (body.startsAt !== undefined) patch.starts_at = body.startsAt;
  if (body.endsAt !== undefined) patch.ends_at = body.endsAt;
  return patch;
};

/**
 * 3J writes six rules as check constraints. A violated one arrives as
 * code 23514 with the constraint name, which is the most precise thing
 * anybody knows about what went wrong — and `new row violates check
 * constraint "events_dates_ordered"` is not a sentence to show a parent.
 *
 * Translating here rather than re-validating in the DTO keeps one copy of
 * each rule, in the place that holds for every writer including the mobile
 * client and psql.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  events_dates_ordered:
    "Check the dates: booking has to open before it closes, close before the event starts, " +
    "and the event has to end after it starts.",
  events_external_url_matches_mode:
    "An external booking link is required when booking is external, and must be empty otherwise.",
  events_title_len: "The title needs to be between 3 and 160 characters.",
  events_one_owner: "An event belongs to one coach or one company, not both.",
  event_categories_team_size_matches_type:
    "A team category needs a team size of at least 2; an individual one must not have any.",
  event_categories_ages_sane: "Check the age range — the maximum cannot be below the minimum.",
};

@Injectable()
export class EventsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Postgres decides who may write; this only decides how the refusal reads.
   *
   * 42501 is insufficient_privilege, which here means the request named a
   * column the grant withholds — an ownership id, in practice. Reported as a
   * refusal because it is one, not a server fault.
   */
  private fail(error: { code?: string; message: string }): never {
    if (error.code === "42501") {
      throw new ForbiddenException("That isn't yours to change.");
    }
    if (error.code === "23514") {
      const name = Object.keys(CONSTRAINT_MESSAGES).find((c) => error.message.includes(c));
      throw new BadRequestException(
        name ? CONSTRAINT_MESSAGES[name] : "Some of those details don't go together.",
      );
    }
    if (error.code === "23503") {
      throw new BadRequestException("That city or category no longer exists.");
    }
    throw new InternalServerErrorException(error.message);
  }

  /**
   * The party the caller writes as.
   *
   * Read rather than accepted from the body: an event's owner is not the
   * client's to nominate. 3J's insert policy would refuse a foreign id
   * anyway, but taking it from the request at all would mean the API's
   * contract disagreed with the database's rule about who owns what.
   */
  private async ownParty(db: SupabaseClient, caller: Caller) {
    const [provider, organiser] = await Promise.all([
      db.from("providers").select("id").eq("user_id", caller.id).maybeSingle(),
      db.from("organisers").select("id").eq("user_id", caller.id).maybeSingle(),
    ]);

    if (provider.error) this.fail(provider.error);
    if (organiser.error) this.fail(organiser.error);

    if (organiser.data) return { organiser_id: organiser.data.id as string };
    if (provider.data) return { provider_id: provider.data.id as string };

    throw new ForbiddenException("Finish your coach or company profile before creating an event.");
  }

  /** The caller's own events, drafts included, soonest first. */
  async mine(caller: Caller): Promise<EventDto[]> {
    const db = this.supabase.asUser(caller.accessToken);
    const party = await this.ownParty(db, caller);

    const column = "organiser_id" in party ? "organiser_id" : "provider_id";
    const id = "organiser_id" in party ? party.organiser_id : party.provider_id;

    const { data, error } = await db
      .from("events")
      .select(WITH_CATEGORIES)
      .eq(column, id as string)
      .order("starts_at", { ascending: true });

    if (error) this.fail(error);
    return (data ?? []).map((r) => toDto(r as unknown as EventRow));
  }

  /**
   * One event.
   *
   * Readable without an account when it is published and its owner is in good
   * standing — 3J's policies decide that, so a guest and an owner run the same
   * query and simply see different rows. A miss is a 404 either way: telling a
   * stranger that a draft exists is itself a leak.
   */
  async one(id: string, caller: Caller | null): Promise<EventDto> {
    const db = caller ? this.supabase.asUser(caller.accessToken) : this.supabase.anon();

    const { data, error } = await db
      .from("events")
      .select(WITH_CATEGORIES)
      .eq("id", id)
      .maybeSingle();

    if (error) this.fail(error);
    if (!data) throw new NotFoundException("No such event.");
    return toDto(data as unknown as EventRow);
  }

  /** What is on in a city. Published only, by the policy rather than a filter. */
  async byCity(cityId: string, caller: Caller | null): Promise<EventDto[]> {
    const db = caller ? this.supabase.asUser(caller.accessToken) : this.supabase.anon();

    const { data, error } = await db
      .from("events")
      .select(WITH_CATEGORIES)
      .eq("city_id", cityId)
      .eq("status", "published")
      .order("starts_at", { ascending: true });

    if (error) this.fail(error);
    return (data ?? []).map((r) => toDto(r as unknown as EventRow));
  }

  /**
   * Create one, always as a draft.
   *
   * `status` is not settable here and is not in the DTO: 3J's insert policy
   * accepts nothing else, and publishing is a separate act with a condition of
   * its own.
   */
  async create(caller: Caller, body: CreateEventDto): Promise<EventDto> {
    const db = this.supabase.asUser(caller.accessToken);
    const party = await this.ownParty(db, caller);

    const { data, error } = await db
      .from("events")
      .insert({ ...toPatch(body), ...party, status: "draft" })
      .select(WITH_CATEGORIES)
      .single();

    if (error) this.fail(error);
    return toDto(data as unknown as EventRow);
  }

  async update(caller: Caller, id: string, body: UpdateEventDto): Promise<EventDto> {
    const db = this.supabase.asUser(caller.accessToken);

    const { data, error } = await db
      .from("events")
      .update(toPatch(body))
      .eq("id", id)
      .select(WITH_CATEGORIES)
      .maybeSingle();

    if (error) this.fail(error);
    // No row came back, so the policy matched nothing: either there is no such
    // event or it is not the caller's. Both are 404 — distinguishing them
    // would confirm the existence of somebody else's draft.
    if (!data) throw new NotFoundException("No such event.");
    return toDto(data as unknown as EventRow);
  }

  /**
   * Publish or withdraw.
   *
   * Nothing here checks whether the owner is approved. 3J's update policy
   * requires `event_party_is_live` for any row landing on `published`, so an
   * unapproved company's attempt matches no row and returns 404. A second
   * check in TypeScript would be a copy of a rule that already holds, and
   * copies drift.
   */
  async setStatus(
    caller: Caller,
    id: string,
    status: "draft" | "published" | "cancelled" | "completed",
  ): Promise<EventDto> {
    const db = this.supabase.asUser(caller.accessToken);

    const { data, error } = await db
      .from("events")
      .update({ status })
      .eq("id", id)
      .select(WITH_CATEGORIES)
      .maybeSingle();

    if (error) this.fail(error);
    if (!data) {
      throw new NotFoundException(
        status === "published"
          ? "That event can't be published. It may not be yours, or your listing may still be waiting for approval."
          : "No such event.",
      );
    }
    return toDto(data as unknown as EventRow);
  }

  /**
   * Save the category set.
   *
   * A diff, not a replacement. It used to delete every row and re-insert,
   * which minted a new id on every save; 3K put entries behind these rows
   * with `on delete restrict`, so that shortcut now fails on an ordinary save
   * and would orphan a family's entry if it did not. A category keeps its id,
   * and therefore its entries and its count, unless it is actually removed.
   *
   * Still not a transaction — PostgREST has no way to make three statements
   * one — but the failure is now survivable in a way delete-then-insert never
   * was: an update that fails leaves the old row, and a delete that fails
   * leaves the category. Nothing is lost either way.
   */
  async replaceCategories(
    caller: Caller,
    id: string,
    body: ReplaceEventCategoriesDto,
  ): Promise<EventDto> {
    const db = this.supabase.asUser(caller.accessToken);

    // Ownership first: every write below silently affects zero rows for a
    // stranger, and a stranger should get a 404 rather than a cheerful empty
    // success.
    const existing = await db
      .from("event_categories")
      .select("id")
      .eq("event_id", id);
    if (existing.error) this.fail(existing.error);

    const event = await db.from("events").select("id").eq("id", id).maybeSingle();
    if (event.error) this.fail(event.error);
    if (!event.data) throw new NotFoundException("No such event.");

    const known = new Set((existing.data ?? []).map((r) => (r as { id: string }).id));
    const kept = new Set<string>();

    const columns = (c: EventCategoryInputDto, index: number) => ({
      name: c.name,
      entry_type: c.entryType,
      team_size: c.teamSize ?? null,
      capacity: c.capacity ?? null,
      fee_amount: c.feeAmount ?? null,
      min_age: c.minAge ?? null,
      max_age: c.maxAge ?? null,
      sort_order: index,
    });

    const additions: Record<string, unknown>[] = [];

    for (const [index, category] of body.categories.entries()) {
      // An id the caller made up, or one from another event, is treated as a
      // new row rather than trusted: the update would match nothing and the
      // category would silently vanish from the form's next load.
      if (category.id && known.has(category.id)) {
        kept.add(category.id);
        const updated = await db
          .from("event_categories")
          .update(columns(category, index))
          .eq("id", category.id);
        if (updated.error) this.fail(updated.error);
      } else {
        additions.push({ event_id: id, ...columns(category, index) });
      }
    }

    const removed = [...known].filter((existingId) => !kept.has(existingId));

    if (removed.length > 0) {
      const wipe = await db.from("event_categories").delete().in("id", removed);
      if (wipe.error) {
        // 23503 here is the entry pointing at it, which is the whole reason
        // this method is a diff.
        if (wipe.error.code === "23503") {
          throw new BadRequestException(
            "A category with entries in it can't be removed. Close it by taking its remaining " +
              "places down to what has already been entered, or cancel the entries first.",
          );
        }
        this.fail(wipe.error);
      }
    }

    if (additions.length > 0) {
      const inserted = await db.from("event_categories").insert(additions);
      if (inserted.error) this.fail(inserted.error);
    }

    return this.one(id, caller);
  }
}
