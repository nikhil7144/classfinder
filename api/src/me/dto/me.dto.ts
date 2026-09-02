import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class MeSeekerDto {
  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  areaId!: string | null;

  @ApiProperty({
    type: [String],
    description: "Service category ids they said they are looking for. Empty until they say.",
  })
  lookingFor!: string[];

  @ApiProperty({ description: "Whether coaches may approach them." })
  openToOffers!: boolean;
}

export class MeProviderDto {
  @ApiProperty({ format: "uuid", description: "The listing id, which is not the user id." })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ enum: ["individual", "institution", "event_planner"] })
  providerType!: string;

  @ApiProperty({ description: "Visible in search. False means waiting on an admin." })
  approved!: boolean;

  @ApiProperty({ description: "Taken down. Different from never approved, and says so." })
  isSuspended!: boolean;
}

/**
 * Who is asking.
 *
 * The first call a client makes after signing in, and the one that decides
 * what it renders. `role: null` is not an error — it is a verified account
 * that has not chosen yet, and the client sends them to pick.
 */
export class MeDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ["seeker", "provider", "admin"],
    description: "Null when the account exists but no role has been chosen.",
  })
  role!: string | null;

  @ApiProperty({ description: "Whether they finished the profile their role requires." })
  profileComplete!: boolean;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({
    type: MeSeekerDto,
    nullable: true,
    description: "Present only for a seeker. Null when the role is set but the row is not.",
  })
  seeker?: MeSeekerDto | null;

  @ApiPropertyOptional({
    type: MeProviderDto,
    nullable: true,
    description: "Present only for a provider.",
  })
  provider?: MeProviderDto | null;
}
