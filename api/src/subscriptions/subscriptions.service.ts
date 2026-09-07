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
  CreatePlanDto,
  MyPlanDto,
  PlanBodyDto,
  PlanDto,
  RecordSubscriptionDto,
  SubscriptionDto,
} from "./dto/subscription.dto";

type PlanRow = {
  id: string;
  audience: "organiser" | "provider" | "advertiser";
  kind: "subscription" | "per_event";
  name: string;
  blurb: string | null;
  price_amount: number | string;
  period_months: number | null;
  max_active_events: number | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
};

type SubscriptionRow = {
  id: string;
  provider_id: string | null;
  organiser_id: string | null;
  plan_id: string;
  event_id: string | null;
  starts_on: string;
  ends_on: string | null;
  amount_paid: number | string | null;
  payment_mode: "cash" | "upi" | "bank_transfer" | "card" | "other" | null;
  payment_reference: string | null;
  paid_on: string | null;
  note: string | null;
  subscription_plans?: { name: string } | null;
  organisers?: { name: string | null } | null;
  providers?: { display_name: string | null } | null;
};

const PLAN_COLUMNS =
  "id, audience, kind, name, blurb, price_amount, period_months, max_active_events, " +
  "is_default, is_active, sort_order";

const SUBSCRIPTION_COLUMNS =
  "id, provider_id, organiser_id, plan_id, event_id, starts_on, ends_on, amount_paid, " +
  "payment_mode, payment_reference, paid_on, note, subscription_plans(name), " +
  "organisers(name), providers(display_name)";

const toPlanDto = (r: PlanRow): PlanDto => ({
  id: r.id,
  audience: r.audience,
  kind: r.kind,
  name: r.name,
  blurb: r.blurb,
  // numeric(10,2) arrives as a string, as everywhere else in this API.
  priceAmount: Number(r.price_amount),
  periodMonths: r.period_months,
  maxActiveEvents: r.max_active_events,
  isDefault: r.is_default,
  isActive: r.is_active,
  sortOrder: r.sort_order,
});

const toSubscriptionDto = (r: SubscriptionRow): SubscriptionDto => ({
  id: r.id,
  partyKind: r.organiser_id ? "organiser" : "provider",
  partyId: (r.organiser_id ?? r.provider_id)!,
  partyName: r.organisers?.name ?? r.providers?.display_name ?? null,
  planId: r.plan_id,
  planName: r.subscription_plans?.name ?? null,
  eventId: r.event_id,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  amountPaid: r.amount_paid === null || r.amount_paid === undefined ? null : Number(r.amount_paid),
  paymentMode: r.payment_mode,
  paymentReference: r.payment_reference,
  paidOn: r.paid_on,
  note: r.note,
});

/** Only the keys the caller sent, mapped to columns. */
const toPlanPatch = (body: PlanBodyDto): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.blurb !== undefined) patch.blurb = body.blurb || null;
  if (body.priceAmount !== undefined) patch.price_amount = body.priceAmount;
  if (body.periodMonths !== undefined) patch.period_months = body.periodMonths;
  if (body.maxActiveEvents !== undefined) patch.max_active_events = body.maxActiveEvents;
  if (body.isDefault !== undefined) patch.is_default = body.isDefault;
  if (body.isActive !== undefined) patch.is_active = body.isActive;
  if (body.sortOrder !== undefined) patch.sort_order = body.sortOrder;
  return patch;
};

@Injectable()
export class SubscriptionsService {
  constructor(private readonly supabase: SupabaseService) {}

  private fail(error: { code?: string; message: string }): never {
    if (error.code === "42501") {
      throw new ForbiddenException("That isn't yours to change.");
    }
    if (error.code === "23505") {
      // The two unique indexes 3L carries: one default per audience, and one
      // purchase per event.
      throw new BadRequestException(
        error.message.includes("one_per_event")
          ? "That event has already been paid for. Edit the existing purchase instead of adding a second."
          : "That audience already has a default plan. Turn the old one off first.",
      );
    }
    if (error.code === "23514" || error.code === "P0001") {
      throw new BadRequestException(
        error.message.includes("per_event_shape")
          ? "A per-event plan has no period and no allowance — it entitles the one event it is bought for."
          : error.message,
      );
    }
    throw new InternalServerErrorException(error.message);
  }

  /**
   * Admin, asked of the database rather than assumed from a header.
   *
   * The write policies in 3L already refuse a non-admin, so this exists to
   * turn that refusal into a sentence rather than an empty result — the same
   * reason the events service reads a 404 out of a policy that matched
   * nothing.
   */
  private async assertAdmin(db: SupabaseClient, caller: Caller): Promise<void> {
    const { data, error } = await db
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();

    if (error) this.fail(error);
    if ((data as { role?: string } | null)?.role !== "admin") {
      throw new ForbiddenException("Admins only.");
    }
  }

  /** The party the caller acts as, read from their own row rather than sent. */
  private async ownParty(db: SupabaseClient, caller: Caller) {
    const [provider, organiser] = await Promise.all([
      db.from("providers").select("id").eq("user_id", caller.id).maybeSingle(),
      db.from("organisers").select("id").eq("user_id", caller.id).maybeSingle(),
    ]);

    if (provider.error) this.fail(provider.error);
    if (organiser.error) this.fail(organiser.error);

    if (organiser.data) {
      return { kind: "organiser" as const, id: (organiser.data as { id: string }).id };
    }
    if (provider.data) {
      return { kind: "provider" as const, id: (provider.data as { id: string }).id };
    }
    throw new ForbiddenException("Finish your coach or company profile first.");
  }

  /** The public price list. */
  async plans(audience: string | undefined, caller: Caller | null): Promise<PlanDto[]> {
    const db = caller ? this.supabase.asUser(caller.accessToken) : this.supabase.anon();

    let query = db.from("subscription_plans").select(PLAN_COLUMNS);
    if (audience) query = query.eq("audience", audience);

    const { data, error } = await query
      .order("audience", { ascending: true })
      .order("sort_order", { ascending: true });

    if (error) this.fail(error);
    return (data ?? []).map((r) => toPlanDto(r as unknown as PlanRow));
  }

  /**
   * What the caller's own business is on.
   *
   * The plan comes from `party_plan`, which is the same function the publish
   * check consults — so this screen and that refusal can never disagree about
   * which plan somebody is on. Only the arithmetic happens here.
   */
  async mine(caller: Caller): Promise<MyPlanDto> {
    const db = this.supabase.asUser(caller.accessToken);
    const party = await this.ownParty(db, caller);

    const providerId = party.kind === "provider" ? party.id : null;
    const organiserId = party.kind === "organiser" ? party.id : null;

    const [planResult, liveResult, holdingResult] = await Promise.all([
      db.rpc("party_plan", { p_provider_id: providerId, p_organiser_id: organiserId }),
      db
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .gte("starts_at", new Date().toISOString())
        .eq(party.kind === "organiser" ? "organiser_id" : "provider_id", party.id),
      db
        .from("party_subscriptions")
        .select("starts_on, ends_on")
        .is("event_id", null)
        .eq(party.kind === "organiser" ? "organiser_id" : "provider_id", party.id)
        .lte("starts_on", new Date().toISOString().slice(0, 10))
        .order("starts_on", { ascending: false })
        .limit(1),
    ]);

    if (planResult.error) this.fail(planResult.error);
    if (liveResult.error) this.fail(liveResult.error);
    if (holdingResult.error) this.fail(holdingResult.error);

    // party_plan returns one composite row; PostgREST hands it back as an
    // object, or as null when nothing is seeded at all.
    const row = (Array.isArray(planResult.data) ? planResult.data[0] : planResult.data) as
      | PlanRow
      | null;
    const plan = row?.id ? toPlanDto(row) : null;

    const liveEvents = liveResult.count ?? 0;
    const cap = plan?.maxActiveEvents ?? null;
    const remaining = cap === null ? null : Math.max(cap - liveEvents, 0);
    const holding = (holdingResult.data ?? [])[0] as
      | { starts_on: string; ends_on: string | null }
      | undefined;

    return {
      partyKind: party.kind,
      partyId: party.id,
      plan,
      liveEvents,
      remaining,
      // Uncapped, or room left. A listing plan caps at zero, and then only a
      // per-event purchase gets an event out — which this cannot know about
      // in advance, because it belongs to an event that may not exist yet.
      canPublishAnother: remaining === null || remaining > 0,
      startsOn: holding?.starts_on ?? null,
      endsOn: holding?.ends_on ?? null,
    };
  }

  /** What this party has bought, newest first. Theirs to read, by policy. */
  async minePurchases(caller: Caller): Promise<SubscriptionDto[]> {
    const db = this.supabase.asUser(caller.accessToken);

    const { data, error } = await db
      .from("party_subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .order("starts_on", { ascending: false });

    if (error) this.fail(error);
    return (data ?? []).map((r) => toSubscriptionDto(r as unknown as SubscriptionRow));
  }

  // ------------------------------------------------------------------
  // The admin console's half.
  // ------------------------------------------------------------------

  async createPlan(caller: Caller, body: CreatePlanDto): Promise<PlanDto> {
    const db = this.supabase.asUser(caller.accessToken);
    await this.assertAdmin(db, caller);

    const { data, error } = await db
      .from("subscription_plans")
      .insert({ audience: body.audience, kind: body.kind, ...toPlanPatch(body) })
      .select(PLAN_COLUMNS)
      .single();

    if (error) this.fail(error);
    return toPlanDto(data as unknown as PlanRow);
  }

  async updatePlan(caller: Caller, id: string, body: PlanBodyDto): Promise<PlanDto> {
    const db = this.supabase.asUser(caller.accessToken);
    await this.assertAdmin(db, caller);

    const { data, error } = await db
      .from("subscription_plans")
      .update(toPlanPatch(body))
      .eq("id", id)
      .select(PLAN_COLUMNS)
      .maybeSingle();

    if (error) this.fail(error);
    if (!data) throw new NotFoundException("No such plan.");
    return toPlanDto(data as unknown as PlanRow);
  }

  async listSubscriptions(caller: Caller): Promise<SubscriptionDto[]> {
    const db = this.supabase.asUser(caller.accessToken);
    await this.assertAdmin(db, caller);

    const { data, error } = await db
      .from("party_subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) this.fail(error);
    return (data ?? []).map((r) => toSubscriptionDto(r as unknown as SubscriptionRow));
  }

  /**
   * Record that somebody paid.
   *
   * `recorded_by` is stamped from the caller rather than accepted, for the
   * reason every ownership id in this API is: who did this is not the
   * client's to nominate.
   */
  async record(caller: Caller, body: RecordSubscriptionDto): Promise<SubscriptionDto> {
    const db = this.supabase.asUser(caller.accessToken);
    await this.assertAdmin(db, caller);

    if (Boolean(body.providerId) === Boolean(body.organiserId)) {
      throw new BadRequestException("Name exactly one coach or one company.");
    }

    const { data, error } = await db
      .from("party_subscriptions")
      .insert({
        provider_id: body.providerId ?? null,
        organiser_id: body.organiserId ?? null,
        plan_id: body.planId,
        event_id: body.eventId ?? null,
        ...(body.startsOn ? { starts_on: body.startsOn } : {}),
        ends_on: body.endsOn ?? null,
        amount_paid: body.amountPaid ?? null,
        payment_mode: body.paymentMode ?? null,
        payment_reference: body.paymentReference ?? null,
        paid_on: body.paidOn ?? null,
        note: body.note ?? null,
        recorded_by: caller.id,
      })
      .select(SUBSCRIPTION_COLUMNS)
      .single();

    if (error) this.fail(error);
    return toSubscriptionDto(data as unknown as SubscriptionRow);
  }
}
