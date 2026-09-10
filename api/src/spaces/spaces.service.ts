import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Caller } from "../auth/current-user.decorator";
import { SupabaseService } from "../supabase/supabase.service";
import {
  CreateSpacePostDto,
  FollowedSpaceDto,
  SpaceDto,
  SpacePostDto,
  SpacePostsQueryDto,
} from "./dto/space.dto";

type SpaceJson = Record<string, unknown>;

export type PostRow = {
  id: string;
  kind: string;
  body: string | null;
  image_url: string | null;
  youtube_id: string | null;
  created_at: string;
  is_hidden: boolean;
  hidden_reason: string | null;
  likes: number | string;
  wows: number | string;
  surprises: number | string;
  my_reaction: string | null;
  i_reported: boolean;
};

export type FollowedRow = {
  provider_id: string;
  display_name: string | null;
  photo_url: string | null;
  headline: string | null;
  post_count: number | string;
  followed_at: string;
};

/** bigint arrives as a string; a count rendered as "12" is a bug nobody looks for. */
const count = (value: unknown): number => Number(value ?? 0);

export const toSpace = (row: SpaceJson): SpaceDto => ({
  id: row.id as string,
  providerId: row.provider_id as string,
  displayName: (row.display_name as string | null) ?? null,
  photoUrl: (row.photo_url as string | null) ?? null,
  headline: (row.headline as string | null) ?? null,
  about: (row.about as string | null) ?? null,
  categoryName: (row.category_name as string | null) ?? null,
  followerCount: count(row.follower_count),
  postCount: count(row.post_count),
  iFollow: Boolean(row.i_follow),
  isMine: Boolean(row.is_mine),
  isSuspended: Boolean(row.is_suspended),
  suspendedReason: (row.suspended_reason as string | null) ?? null,
});

export const toPost = (row: PostRow): SpacePostDto => ({
  id: row.id,
  kind: row.kind,
  body: row.body,
  imageUrl: row.image_url,
  youtubeId: row.youtube_id,
  createdAt: row.created_at,
  isHidden: Boolean(row.is_hidden),
  hiddenReason: row.hidden_reason,
  likes: count(row.likes),
  wows: count(row.wows),
  surprises: count(row.surprises),
  myReaction: row.my_reaction ?? null,
  iReported: Boolean(row.i_reported),
});

export const toFollowed = (row: FollowedRow): FollowedSpaceDto => ({
  providerId: row.provider_id,
  displayName: row.display_name,
  photoUrl: row.photo_url,
  headline: row.headline,
  postCount: count(row.post_count),
  followedAt: row.followed_at,
});

@Injectable()
export class SpacesService {
  constructor(private readonly supabase: SupabaseService) {}

  private db(caller: Caller | null) {
    // As the caller when there is one — iFollow, isMine and myReaction are all
    // answers about them — and as anon otherwise, because a family reads a
    // Space before it has an account.
    return caller ? this.supabase.asUser(caller.accessToken) : this.supabase.anon();
  }

  /**
   * One Space, keyed by the coach rather than the space id.
   *
   * A client arrives here from search or a profile, and what it holds is a
   * provider id. get_space() takes the same, and applies the visibility rule
   * itself: public, or your own in whatever state. Null means neither, which
   * is a 404 — not re-checked here, because a copy of that rule could disagree
   * with the one enforcing it.
   */
  async one(providerId: string, caller: Caller | null): Promise<SpaceDto> {
    const { data, error } = await this.db(caller).rpc("get_space", { p_provider_id: providerId });

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException("No such Space.");
    return toSpace(data as SpaceJson);
  }

  /**
   * A Space's posts.
   *
   * space_feed() wants a space id and the caller has a provider id, so the
   * Space is resolved first. That also gets the visibility check for free: a
   * Space nobody may read 404s before any posts are fetched.
   */
  async posts(
    providerId: string,
    caller: Caller | null,
    query: SpacePostsQueryDto,
  ): Promise<SpacePostDto[]> {
    const space = await this.one(providerId, caller);

    const { data, error } = await this.db(caller).rpc("space_feed", {
      p_space_id: space.id,
      p_limit: query.limit ?? 30,
      p_before: query.before ?? null,
    });

    if (error) throw new InternalServerErrorException(error.message);
    return ((data as PostRow[]) ?? []).map(toPost);
  }

  /** The roster of Spaces the caller follows. */
  async following(caller: Caller): Promise<FollowedSpaceDto[]> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("my_followed_spaces");

    if (error) throw new InternalServerErrorException(error.message);
    return ((data as FollowedRow[]) ?? []).map(toFollowed);
  }

  async setFollowing(caller: Caller, providerId: string, follow: boolean): Promise<SpaceDto> {
    const space = await this.one(providerId, caller);
    const db = this.supabase.asUser(caller.accessToken);

    const { error } = follow
      ? await db.from("space_followers").upsert(
          { space_id: space.id, user_id: caller.id },
          // Following twice is the same as following once. An upsert makes a
          // double tap idempotent instead of a unique-violation the client has
          // to interpret.
          { onConflict: "space_id,user_id", ignoreDuplicates: true },
        )
      : await db.from("space_followers").delete().eq("space_id", space.id).eq("user_id", caller.id);

    if (error) throw new InternalServerErrorException(error.message);
    return this.one(providerId, caller);
  }

  /**
   * Like, wow, surprise — or null to take it back.
   *
   * set_reaction() is a definer write: one row per person per post, upserted
   * or deleted. RLS cannot express "replace your own reaction and nobody
   * else's" as an update policy, which is why it is a function.
   */
  async setReaction(caller: Caller, postId: string, reaction: string | null): Promise<void> {
    const { error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("set_reaction", { p_post_id: postId, p_reaction: reaction });

    if (error) throw new InternalServerErrorException(error.message);
  }

  /**
   * Post to your own Space.
   *
   * The bytes are already in Storage by the time this is called — the client
   * uploads against a signed URL and sends the public URL. The row policy
   * refuses a post to somebody else's Space, so ownership is not re-checked;
   * the Space is resolved only to turn the caller's provider id into a space
   * id, and isMine gives a clearer refusal than a policy violation would.
   */
  async createPost(
    caller: Caller,
    providerId: string,
    body: CreateSpacePostDto,
  ): Promise<SpacePostDto> {
    const space = await this.one(providerId, caller);
    if (!space.isMine) throw new ForbiddenException("That is not your Space.");

    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .from("space_posts")
      .insert({
        space_id: space.id,
        kind: body.kind,
        body: body.body?.trim() || null,
        image_url: body.kind === "photo" ? body.imageUrl ?? null : null,
        youtube_id: body.kind === "video" ? body.youtubeId ?? null : null,
      })
      .select("*")
      .single();

    if (error) throw new InternalServerErrorException(error.message);

    const row = data as Record<string, unknown>;
    return toPost({
      ...(row as unknown as PostRow),
      // A new post has no reactions and nobody has reported it. space_feed
      // computes these; a plain insert does not return them.
      likes: 0,
      wows: 0,
      surprises: 0,
      my_reaction: null,
      i_reported: false,
    });
  }

  /** Delete your own post. The row policy decides; a miss is a 404. */
  async deletePost(caller: Caller, postId: string): Promise<void> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .from("space_posts")
      .delete()
      .eq("id", postId)
      .select("id");

    if (error) throw new InternalServerErrorException(error.message);
    if (!data || (data as unknown[]).length === 0) {
      throw new NotFoundException("No such post.");
    }
  }
}
