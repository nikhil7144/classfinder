import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import {
  CreateGroupDto,
  GroupContactDto,
  GroupDto,
  GroupInviteDto,
  GroupPitchDto,
  RespondToPitchDto,
  UpdateGroupDto,
} from "./dto/group.dto";

/** A row exactly as my_groups() returns it. */
type GroupRow = {
  id: string;
  service_name: string | null;
  area_name: string | null;
  city_name: string | null;
  society_name: string | null;
  student_count: number;
  /** bigint — a string by the time it lands. */
  member_count: number | string | null;
  expires_at: string;
  closed_at: string | null;
  is_creator: boolean;
  is_active: boolean;
  pending_requests: number | string | null;
  created_at: string;
};

/** A row exactly as group_threads() returns it. */
type PitchRow = {
  request_id: string;
  provider_id: string;
  provider_name: string | null;
  provider_photo_url: string | null;
  pitch: string | null;
  status: string;
  created_at: string;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  message_count: number | string | null;
  unread: boolean;
  is_creator: boolean;
};

const count = (value: unknown): number => Number(value ?? 0);

export const toGroup = (r: GroupRow): GroupDto => ({
  id: r.id,
  serviceName: r.service_name,
  areaName: r.area_name,
  cityName: r.city_name,
  societyName: r.society_name,
  studentCount: count(r.student_count),
  memberCount: count(r.member_count),
  expiresAt: r.expires_at,
  closedAt: r.closed_at,
  isCreator: Boolean(r.is_creator),
  isActive: Boolean(r.is_active),
  pendingRequests: count(r.pending_requests),
  createdAt: r.created_at,
});

export const toPitch = (r: PitchRow): GroupPitchDto => ({
  requestId: r.request_id,
  providerId: r.provider_id,
  providerName: r.provider_name,
  providerPhotoUrl: r.provider_photo_url,
  pitch: r.pitch,
  status: r.status,
  createdAt: r.created_at,
  lastMessage: r.last_message,
  lastMessageAt: r.last_message_at,
  lastSenderId: r.last_sender_id,
  messageCount: count(r.message_count),
  unread: Boolean(r.unread),
  isCreator: Boolean(r.is_creator),
});

@Injectable()
export class GroupsService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Every group the caller is in, whether they made it or joined it. */
  async mine(caller: Caller): Promise<GroupDto[]> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("my_groups");

    if (error) throw new InternalServerErrorException(error.message);
    return ((data as GroupRow[]) ?? []).map(toGroup);
  }

  /**
   * One group, as somebody following an invite link sees it.
   *
   * Public: the whole point of a group is that a neighbour can be sent a link
   * and decide whether to join. It carries nothing about who is in it, and
   * `alreadyMember` is false for a guest rather than an error.
   */
  async invite(id: string, caller: Caller | null): Promise<GroupInviteDto> {
    const db = caller ? this.supabase.asUser(caller.accessToken) : this.supabase.anon();

    const { data, error } = await db.rpc("get_group_invite", { p_id: id });
    if (error) throw new InternalServerErrorException(error.message);

    const row = data as Record<string, unknown> | null;
    // The function answers null for an id that does not exist. A group nobody
    // can find and a group that was never there read the same to a visitor.
    if (!row || !row.id) throw new NotFoundException("That group link is not valid any more.");

    return {
      id: row.id as string,
      serviceName: (row.service_name as string) ?? null,
      areaName: (row.area_name as string) ?? null,
      cityName: (row.city_name as string) ?? null,
      societyName: (row.society_name as string) ?? null,
      studentCount: count(row.student_count),
      notes: (row.notes as string) ?? null,
      memberCount: count(row.member_count),
      expiresAt: row.expires_at as string,
      isOpen: Boolean(row.is_open),
      alreadyMember: Boolean(row.already_member),
    };
  }

  /** The coaches who have pitched to one group. */
  async pitches(caller: Caller, groupId: string): Promise<GroupPitchDto[]> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("group_threads", { p_group_id: groupId });

    if (error) throw new InternalServerErrorException(error.message);
    return ((data as PitchRow[]) ?? []).map(toPitch);
  }

  /**
   * Start one.
   *
   * Inserted as the caller, so the insert policy does the deciding — and the
   * creator is added as the first member here rather than by a trigger,
   * because a group of nobody is not a group and the two writes belong
   * together.
   */
  async create(caller: Caller, body: CreateGroupDto): Promise<GroupDto> {
    const db = this.supabase.asUser(caller.accessToken);

    const { data, error } = await db
      .from("groups")
      .insert({
        creator_id: caller.id,
        service_category_id: body.serviceCategoryId,
        area_id: body.areaId,
        society_name: body.societyName.trim(),
        notes: body.notes?.trim() || null,
        student_count: body.studentCount ?? 1,
        show_phone: body.sharePhone ?? false,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "42501") {
        throw new ForbiddenException("Finish your profile before starting a group.");
      }
      throw new InternalServerErrorException(error.message);
    }

    const id = (data as { id: string }).id;
    await db.from("group_members").insert({ group_id: id, user_id: caller.id });

    return this.readBack(caller, id);
  }

  /**
   * Edit one, or close it.
   *
   * Closing is a field rather than its own endpoint: it is a creator saying
   * they are done, not a state machine, and it is reversible while the group
   * has not expired. `closed_at` carries that as a timestamp or a null.
   */
  async update(caller: Caller, id: string, body: UpdateGroupDto): Promise<GroupDto> {
    const patch: Record<string, unknown> = {};

    if (body.societyName !== undefined) patch.society_name = body.societyName.trim();
    if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
    if (body.studentCount !== undefined) patch.student_count = body.studentCount;
    if (body.sharePhone !== undefined) patch.show_phone = body.sharePhone;
    if (body.closed !== undefined) {
      patch.closed_at = body.closed ? new Date().toISOString() : null;
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException("Nothing to change.");
    }

    const { error } = await this.supabase
      .asUser(caller.accessToken)
      .from("groups")
      .update(patch)
      .eq("id", id);

    // The update policy is the ownership rule: somebody else's group simply
    // matches nothing, so this only fires on a real failure.
    if (error) throw new ForbiddenException(error.message);

    return this.readBack(caller, id);
  }

  /** Join one. Idempotent: joining twice is joining once. */
  async join(caller: Caller, id: string): Promise<GroupDto> {
    const { error } = await this.supabase
      .asUser(caller.accessToken)
      .from("group_members")
      .insert({ group_id: id, user_id: caller.id });

    if (error) {
      // Already a member. A second tap on a slow connection is the common
      // cause, and it is not a failure worth showing anybody.
      if (error.code !== "23505") {
        if (error.code === "42501") {
          throw new ForbiddenException("That group is not open to join.");
        }
        throw new InternalServerErrorException(error.message);
      }
    }

    return this.readBack(caller, id);
  }

  /**
   * Leave one.
   *
   * The creator leaving would orphan the group — the pitches, the threads and
   * the invite all hang off them — so they close it instead, which is what the
   * refusal says.
   */
  async leave(caller: Caller, id: string): Promise<void> {
    const db = this.supabase.asUser(caller.accessToken);

    const { data: group } = await db
      .from("groups")
      .select("creator_id")
      .eq("id", id)
      .maybeSingle();

    if ((group as { creator_id: string } | null)?.creator_id === caller.id) {
      throw new BadRequestException(
        "You started this group, so you cannot leave it. Close it instead.",
      );
    }

    const { error } = await db
      .from("group_members")
      .delete()
      .eq("group_id", id)
      .eq("user_id", caller.id);

    if (error) throw new ForbiddenException(error.message);
  }

  /** Accept or decline a coach who pitched. The creator's decision alone. */
  async respondToPitch(
    caller: Caller,
    requestId: string,
    body: RespondToPitchDto,
  ): Promise<void> {
    const { error } = await this.supabase
      .asUser(caller.accessToken)
      .from("group_requests")
      .update({ status: body.status, responded_at: new Date().toISOString() })
      .eq("id", requestId);

    if (error) throw new ForbiddenException(error.message);
  }

  /** The group's contact details, for a coach whose pitch was accepted. */
  async pitchContact(caller: Caller, requestId: string): Promise<GroupContactDto> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("get_request_contact", { p_request_id: requestId });

    if (error) throw new InternalServerErrorException(error.message);

    const row = (data as Record<string, unknown> | null) ?? {};
    return {
      phone: (row.phone as string) ?? null,
      name: (row.name as string) ?? null,
      societyName: (row.society_name as string) ?? null,
      shared: Boolean(row.shared),
    };
  }

  /**
   * One group, read through the list function.
   *
   * my_groups() resolves isCreator, isActive and the pitch count for whoever
   * asked. Reading a group any other way would mean deciding those a second
   * time, and getting the pitch count wrong would show one member another's
   * business.
   */
  private async readBack(caller: Caller, id: string): Promise<GroupDto> {
    const groups = await this.mine(caller);
    const group = groups.find((g) => g.id === id);

    if (!group) throw new NotFoundException("That group is not there any more.");
    return group;
  }
}
