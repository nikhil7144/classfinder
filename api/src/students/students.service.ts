import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import { ApproachDto, ApproachResultDto } from "./dto/approach.dto";
import { DemandRowDto, StudentsQueryDto } from "./dto/student.dto";

/** A row exactly as students_for_provider() returns it. */
export type DemandRow = {
  kind: string;
  id: string;
  service_category_ids: string[] | null;
  service_names: string[] | null;
  service_groups: string[] | null;
  area_id: string | null;
  area_name: string | null;
  city_name: string | null;
  distance_km: number | null;
  learner_age: number | null;
  level: string | null;
  preferred_modes: string[] | null;
  preferred_days: string[] | null;
  preferred_time: string | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_period: string | null;
  notes: string | null;
  student_count: number | null;
  /** bigint — arrives as a string, because 64 bits do not survive JSON. */
  member_count: number | string | null;
  expires_at: string | null;
  created_at: string;
  contact_status: string | null;
  thread_id: string | null;
};

const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/** Counts are never null on screen: "how many children" reads badly as blank. */
const count = (value: unknown): number => Number(value ?? 0);

export const toDemandRow = (row: DemandRow): DemandRowDto => ({
  kind: row.kind,
  id: row.id,
  serviceCategoryIds: row.service_category_ids ?? [],
  serviceNames: row.service_names ?? [],
  serviceGroups: row.service_groups ?? [],
  areaId: row.area_id,
  areaName: row.area_name,
  cityName: row.city_name,
  distanceKm: num(row.distance_km),
  learnerAge: num(row.learner_age),
  level: row.level,
  preferredModes: row.preferred_modes ?? [],
  preferredDays: row.preferred_days ?? [],
  preferredTime: row.preferred_time,
  budgetMin: num(row.budget_min),
  budgetMax: num(row.budget_max),
  budgetPeriod: row.budget_period,
  notes: row.notes,
  studentCount: count(row.student_count),
  memberCount: count(row.member_count),
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  contactStatus: row.contact_status,
  threadId: row.thread_id,
});

@Injectable()
export class StudentsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Write to a family, or to a group of them.
   *
   * Two tables under one contract, as with threads: a group pitch is a
   * group_request and a cold approach to one parent is an enquiry. A client
   * says which kind the row was and stops caring.
   *
   * Nothing here enforces consent — the database does, and more reliably. An
   * enquiry opened by a provider may only be 'pending', by check constraint,
   * and enquiry_messages has always required an open one. So a coach gets a
   * single message until the family answers, and this endpoint could not grant
   * more if it tried.
   *
   * A second approach to the same group is refused by a unique index rather
   * than by a lookup here, which is what makes a double tap safe.
   */
  async approach(
    caller: Caller,
    kind: "student" | "group",
    targetId: string,
    body: ApproachDto,
  ): Promise<ApproachResultDto> {
    const db = this.supabase.asUser(caller.accessToken);

    const insert =
      kind === "group"
        ? db.from("group_requests").insert({
            group_id: targetId,
            provider_id: body.providerId,
            message: body.message.trim(),
          })
        : db.from("enquiries").insert({
            seeker_id: targetId,
            provider_id: body.providerId,
            service_category_id: body.serviceCategoryId ?? null,
            message: body.message.trim(),
            initiated_by: "provider",
            status: "pending",
          });

    const { data, error } = await insert.select("id, status").single();

    if (error) {
      if (error.code === "23505") {
        throw new BadRequestException("You have already written to them.");
      }
      // A policy that matched no row, or a check constraint. Both carry a
      // message worth showing rather than a 500.
      if (error.code?.startsWith("23") || error.code === "P0001" || error.code === "42501") {
        throw new BadRequestException(error.message);
      }
      throw new InternalServerErrorException(error.message);
    }

    const row = data as { id: string; status: string };
    return { id: row.id, kind, status: row.status };
  }

  /**
   * Families and groups near this coach who want something they teach.
   *
   * Read as the caller, which is the whole security model here:
   * students_for_provider() is security definer and its first CTE requires
   * `p.user_id = auth.uid()`, so a coach passing somebody else's listing id
   * gets an empty list rather than that coach's families. Nothing is
   * re-checked here — a second copy of that rule could disagree with the one
   * enforcing it.
   *
   * Ordering is the function's: untouched rows first, then by distance, then
   * newest. A coach opening this screen should see who they have not answered
   * yet, not who is nearest.
   */
  async forProvider(caller: Caller, query: StudentsQueryDto): Promise<DemandRowDto[]> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("students_for_provider", {
        p_provider_id: query.providerId,
        p_service_category_id: query.serviceCategoryId ?? null,
        p_area_id: query.areaId ?? null,
        p_radius_km: query.radiusKm ?? 15,
        p_limit: query.limit ?? 60,
      });

    if (error) throw new InternalServerErrorException(error.message);
    return ((data as DemandRow[]) ?? []).map(toDemandRow);
  }
}
