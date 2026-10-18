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
  GROUP_EXTEND_DAYS,
  GROUP_MIN_STUDENTS,
  GROUP_PUBLISHED_DAYS,
  GroupContactDto,
  GroupDto,
  GroupInviteDto,
  GroupPitchDto,
  GroupPostDto,
  CreateGroupPostDto,
  DiscoverGroupDto,
  ProviderGroupDto,
  PublicGroupDto,
  PublishGroupDto,
  RespondToPitchDto,
  UpdateGroupDto,
  UpdatePostVisibilityDto,
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
        student_count: body.studentCount ?? GROUP_MIN_STUDENTS,
        show_phone: body.sharePhone ?? false,
        // The creator picks the window. Without this the column default
        // decides, and the four choices the form offers would mean nothing.
        expires_at: this.daysFromNow(body.validityDays ?? GROUP_EXTEND_DAYS),
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
   * Edit one, close it, reopen it, or give it longer.
   *
   * Closing is a field rather than its own endpoint: it is a creator saying
   * they are done, not a state machine. `closed_at` carries that as a
   * timestamp or a null.
   *
   * Reopening also pushes the expiry out when the group has already lapsed.
   * GroupOverview carries a comment about exactly this: "Closing used to be a
   * dead end: Extend only moved expires_at and never cleared closed_at, so the
   * button was still offered and did nothing." The mirror of that bug is
   * clearing closed_at on an expired group, which would leave something that
   * says it is open and that no coach can pitch to. Both halves move together
   * here so neither can be forgotten.
   */
  async update(caller: Caller, id: string, body: UpdateGroupDto): Promise<GroupDto> {
    const db = this.supabase.asUser(caller.accessToken);
    const patch: Record<string, unknown> = {};

    if (body.societyName !== undefined) patch.society_name = body.societyName.trim();
    if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
    if (body.studentCount !== undefined) patch.student_count = body.studentCount;
    if (body.sharePhone !== undefined) patch.show_phone = body.sharePhone;
    if (body.closed !== undefined) {
      patch.closed_at = body.closed ? new Date().toISOString() : null;
    }

    // An extension always moves it; reopening moves it only if it had lapsed,
    // because a creator reopening something with a week left has not asked for
    // another ten days.
    let extend = body.extend === true;
    if (body.closed === false && !extend) {
      const { data } = await db
        .from("groups")
        .select("expires_at")
        .eq("id", id)
        .maybeSingle();

      const expiresAt = (data as { expires_at: string } | null)?.expires_at;
      extend = Boolean(expiresAt) && new Date(expiresAt as string).getTime() <= Date.now();
    }

    if (extend) patch.expires_at = this.extendedTo();

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException("Nothing to change.");
    }

    const { error } = await db
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

  private daysFromNow(days: number): string {
    return new Date(Date.now() + days * 86_400_000).toISOString();
  }

  /** Ten days from now, matching what the web offers. */
  private extendedTo(): string {
    return this.daysFromNow(GROUP_EXTEND_DAYS);
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

  /* -------------------------------------------------------------------
     Communities.

     Live and public are different things. Live is is_group_active(): the
     families are here and it is looking for a coach. Public is the creator
     choosing to showcase it, and nothing else makes it happen. An accepted
     coach does not publish a group, and a group still recruiting its second
     family has nothing to publish, because recruiting happens down the
     invite link and a showcase is not a recruitment ad.
     ------------------------------------------------------------------- */

  /**
   * Published groups, by city, area and service.
   *
   * Anonymous by design, because the point of publishing is that a stranger
   * can find it. Carries no society name and no member names, the same list
   * the coach view withholds.
   */
  async discover(
    caller: Caller | null,
    where: {
      cityId?: string;
      areaId?: string;
      serviceCategoryId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<DiscoverGroupDto[]> {
    const db = caller ? this.supabase.asUser(caller.accessToken) : this.supabase.anon();

    const { data, error } = await db.rpc("groups_discover", {
      p_city_id: where.cityId ?? null,
      p_area_id: where.areaId ?? null,
      p_service_category_id: where.serviceCategoryId ?? null,
      p_limit: where.limit ?? 24,
      p_offset: where.offset ?? 0,
    });
    if (error) throw new InternalServerErrorException(error.message);

    return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
      id: r.id as string,
      serviceCategoryId: r.service_category_id as string,
      serviceName: (r.service_name as string) ?? null,
      areaId: (r.area_id as string) ?? null,
      areaName: (r.area_name as string) ?? null,
      cityId: (r.city_id as string) ?? null,
      cityName: (r.city_name as string) ?? null,
      studentCount: count(r.student_count),
      memberCount: count(r.member_count),
      publicHeadline: (r.public_headline as string) ?? null,
      publicAbout: (r.public_about as string) ?? null,
      publishedAt: (r.published_at as string) ?? null,
      hasCoach: Boolean(r.has_coach),
      publicPostCount: count(r.public_post_count),
      alreadyMember: false,
    }));
  }

  /** One published group. Unpublished reads as missing, not forbidden. */
  async publicView(id: string, caller: Caller | null): Promise<PublicGroupDto> {
    const db = caller ? this.supabase.asUser(caller.accessToken) : this.supabase.anon();

    const { data, error } = await db.rpc("group_public", { p_id: id });
    if (error) throw new InternalServerErrorException(error.message);

    const row = data as Record<string, unknown> | null;
    if (!row || !row.id) throw new NotFoundException("That group is not public.");

    return {
      id: row.id as string,
      serviceName: (row.service_name as string) ?? null,
      areaName: (row.area_name as string) ?? null,
      cityName: (row.city_name as string) ?? null,
      studentCount: count(row.student_count),
      memberCount: count(row.member_count),
      publicHeadline: (row.public_headline as string) ?? null,
      publicAbout: (row.public_about as string) ?? null,
      publishedAt: (row.published_at as string) ?? null,
      hasCoach: Boolean(row.has_coach),
      alreadyMember: Boolean(row.already_member),
    };
  }

  /** The groups a coach trains, for their public page. */
  async forPublicProvider(
    providerId: string,
    caller: Caller | null,
  ): Promise<ProviderGroupDto[]> {
    const db = caller ? this.supabase.asUser(caller.accessToken) : this.supabase.anon();

    const { data, error } = await db.rpc("groups_for_public_provider", {
      p_provider_id: providerId,
    });
    if (error) throw new InternalServerErrorException(error.message);

    return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
      id: r.id as string,
      serviceName: (r.service_name as string) ?? null,
      areaName: (r.area_name as string) ?? null,
      cityName: (r.city_name as string) ?? null,
      studentCount: count(r.student_count),
      memberCount: count(r.member_count),
      publicHeadline: (r.public_headline as string) ?? null,
    }));
  }

  /**
   * Publish it, or take it back down.
   *
   * Creator only, and only once the group is live: two families, still open.
   * Publishing rolls expiry out by GROUP_PUBLISHED_DAYS rather than the ten
   * days that gate coach-visible demand, because a page meant to be found
   * cannot be rebuilt every week and a half.
   */
  async publish(caller: Caller, id: string, body: PublishGroupDto): Promise<PublicGroupDto> {
    const db = this.supabase.asUser(caller.accessToken);

    const { data: row } = await db
      .from("groups")
      .select("creator_id")
      .eq("id", id)
      .maybeSingle();

    const creatorId = (row as { creator_id: string } | null)?.creator_id;
    if (!creatorId) throw new NotFoundException("That group is not there any more.");
    if (creatorId !== caller.id) {
      throw new ForbiddenException("Only the person who made the group can publish it.");
    }

    if (body.published) {
      const { data: live, error: liveError } = await db.rpc("is_group_active", {
        p_group_id: id,
      });
      if (liveError) throw new InternalServerErrorException(liveError.message);
      if (!live) {
        throw new BadRequestException(
          "A group can be shown on Aspire91 once it is live: two families, still open.",
        );
      }
    }

    const patch: Record<string, unknown> = {
      published_at: body.published ? new Date().toISOString() : null,
    };
    if (body.publicHeadline !== undefined) patch.public_headline = body.publicHeadline;
    if (body.publicAbout !== undefined) patch.public_about = body.publicAbout;
    if (body.published) patch.expires_at = this.daysFromNow(GROUP_PUBLISHED_DAYS);

    const { error } = await db.from("groups").update(patch).eq("id", id);
    if (error) throw new InternalServerErrorException(error.message);

    // Nothing public left to read back once it is down.
    if (!body.published) {
      return {
        id,
        serviceName: null,
        areaName: null,
        cityName: null,
        studentCount: 0,
        memberCount: 0,
        publicHeadline: body.publicHeadline ?? null,
        publicAbout: body.publicAbout ?? null,
        publishedAt: null,
        hasCoach: false,
        alreadyMember: true,
      };
    }

    return this.publicView(id, caller);
  }

  /**
   * The group's posts.
   *
   * A member sees all of them; anybody else sees only what an author opened,
   * and only while the group is published. That split is the RLS policy's
   * rather than this method's, which is why the member read goes through the
   * table as the caller instead of a definer function.
   */
  async posts(id: string, caller: Caller | null): Promise<GroupPostDto[]> {
    if (!caller) {
      const { data, error } = await this.supabase.anon().rpc("group_public_posts", {
        p_group_id: id,
        p_limit: 24,
      });
      if (error) throw new InternalServerErrorException(error.message);

      return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
        id: r.id as string,
        kind: r.kind as string,
        body: (r.body as string) ?? null,
        imageUrl: (r.image_url as string) ?? null,
        youtubeId: (r.youtube_id as string) ?? null,
        visibility: "public",
        showOrder: (r.show_order as number) ?? null,
        createdAt: r.created_at as string,
      }));
    }

    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .from("group_posts")
      .select("id, kind, body, image_url, youtube_id, visibility, show_order, created_at")
      .eq("group_id", id)
      .eq("is_hidden", false)
      .order("show_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new InternalServerErrorException(error.message);

    return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
      id: r.id as string,
      kind: r.kind as string,
      body: (r.body as string) ?? null,
      imageUrl: (r.image_url as string) ?? null,
      youtubeId: (r.youtube_id as string) ?? null,
      visibility: r.visibility as string,
      showOrder: (r.show_order as number) ?? null,
      createdAt: r.created_at as string,
    }));
  }

  /**
   * Post to a group.
   *
   * Members only, and the insert policy is what says so: a non-member matches
   * nothing and gets a row back of null rather than an error.
   */
  async addPost(caller: Caller, id: string, body: CreateGroupPostDto): Promise<GroupPostDto> {
    if (body.kind === "photo" && !body.imageUrl) {
      throw new BadRequestException("A photo post needs an image.");
    }
    if (body.kind === "video" && !body.youtubeId) {
      throw new BadRequestException("A video post needs a YouTube id.");
    }

    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .from("group_posts")
      .insert({
        group_id: id,
        author_id: caller.id,
        kind: body.kind,
        body: body.body ?? null,
        image_url: body.kind === "photo" ? body.imageUrl : null,
        youtube_id: body.kind === "video" ? body.youtubeId : null,
      })
      .select("id, kind, body, image_url, youtube_id, visibility, show_order, created_at")
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    const row = data as Record<string, unknown> | null;
    if (!row) throw new ForbiddenException("Only members of the group can post to it.");

    return {
      id: row.id as string,
      kind: row.kind as string,
      body: (row.body as string) ?? null,
      imageUrl: (row.image_url as string) ?? null,
      youtubeId: (row.youtube_id as string) ?? null,
      visibility: row.visibility as string,
      showOrder: (row.show_order as number) ?? null,
      createdAt: row.created_at as string,
    };
  }

  /**
   * Open a post to the showcase, or close it again.
   *
   * The author's own post and nobody else's, enforced by the update policy. A
   * creator who could promote any post could publish a photo of another
   * family's child, and that parent agreed to share with their group.
   */
  async setPostVisibility(
    caller: Caller,
    postId: string,
    body: UpdatePostVisibilityDto,
  ): Promise<GroupPostDto> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .from("group_posts")
      .update({ visibility: body.visibility })
      .eq("id", postId)
      .select("id, kind, body, image_url, youtube_id, visibility, show_order, created_at")
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    const row = data as Record<string, unknown> | null;
    if (!row) throw new ForbiddenException("Only the person who posted it can change that.");

    return {
      id: row.id as string,
      kind: row.kind as string,
      body: (row.body as string) ?? null,
      imageUrl: (row.image_url as string) ?? null,
      youtubeId: (row.youtube_id as string) ?? null,
      visibility: row.visibility as string,
      showOrder: (row.show_order as number) ?? null,
      createdAt: row.created_at as string,
    };
  }
}
