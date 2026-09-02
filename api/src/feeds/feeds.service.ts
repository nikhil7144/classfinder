import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { Caller } from "../auth/current-user.decorator";
import { CityDto } from "./dto/city.dto";
import { FeedPostDto } from "./dto/feed-post.dto";
import { FeedQueryDto } from "./dto/feed-query.dto";

/** The row shape phase3b's functions return. Internal — never leaves this file. */
type FeedRow = {
  id: string;
  provider_id: string;
  display_name: string | null;
  photo_url: string | null;
  category_name: string | null;
  kind: "photo" | "video";
  body: string | null;
  image_url: string | null;
  youtube_id: string | null;
  created_at: string;
  likes: number | string;
  wows: number | string;
  surprises: number | string;
  my_reaction?: "like" | "wow" | "surprise" | null;
  i_reported?: boolean;
  reason?: "following" | "interest";
};

type CityRow = {
  id: string;
  name: string;
  state: string | null;
  coach_count: number | string;
};

/**
 * Postgres `bigint` arrives over PostgREST as a string, because a 64-bit
 * integer does not survive JSON. Every count in these feeds is one, and a
 * client that renders `"12"` where it expected `12` is a bug nobody looks for
 * — so the coercion happens once, here, rather than in each caller.
 */
const count = (value: number | string): number => Number(value ?? 0);

export const toFeedPost = (row: FeedRow): FeedPostDto => ({
  id: row.id,
  providerId: row.provider_id,
  displayName: row.display_name,
  photoUrl: row.photo_url,
  categoryName: row.category_name,
  kind: row.kind,
  body: row.body,
  imageUrl: row.image_url,
  youtubeId: row.youtube_id,
  createdAt: row.created_at,
  likes: count(row.likes),
  wows: count(row.wows),
  surprises: count(row.surprises),
  ...(row.my_reaction !== undefined ? { myReaction: row.my_reaction } : {}),
  ...(row.i_reported !== undefined ? { iReported: row.i_reported } : {}),
  ...(row.reason !== undefined ? { reason: row.reason } : {}),
});

export const toCity = (row: CityRow): CityDto => ({
  id: row.id,
  name: row.name,
  state: row.state,
  coachCount: count(row.coach_count),
});

@Injectable()
export class FeedsService {
  constructor(private readonly supabase: SupabaseService) {}

  async liveCities(): Promise<CityDto[]> {
    const { data, error } = await this.supabase.anon().rpc("live_cities");
    if (error) throw new InternalServerErrorException(error.message);
    return ((data as CityRow[]) ?? []).map(toCity);
  }

  /**
   * The guest feed. Read as `anon` on purpose even when a caller is present:
   * this is the shop window, and it must look the same to everybody so it can
   * be cached in front of.
   */
  async cityFeed(cityId: string, query: FeedQueryDto): Promise<FeedPostDto[]> {
    const { data, error } = await this.supabase.anon().rpc("public_city_feed", {
      p_city_id: cityId,
      p_limit: query.limit ?? 24,
      p_before: query.before ?? null,
    });
    if (error) throw new InternalServerErrorException(error.message);
    return ((data as FeedRow[]) ?? []).map(toFeedPost);
  }

  /**
   * The signed-in feed, read as the caller so RLS and `auth.uid()` inside
   * my_space_feed() resolve to the right person. Nothing here re-checks who
   * they are — the database already refuses to answer as anyone else.
   */
  async myFeed(caller: Caller, query: FeedQueryDto): Promise<FeedPostDto[]> {
    const { data, error } = await this.supabase
      .asUser(caller.accessToken)
      .rpc("my_space_feed", {
        p_limit: query.limit ?? 24,
        p_before: query.before ?? null,
      });
    if (error) throw new InternalServerErrorException(error.message);
    return ((data as FeedRow[]) ?? []).map(toFeedPost);
  }
}
