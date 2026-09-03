import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Matches,
} from "class-validator";

/**
 * An event company's listing.
 *
 * Deliberately not shaped like a provider. A coach is found by what they teach
 * and where they travel; an events business is found by what it is running and
 * where, and is contacted about a booking rather than through the enquiry
 * thread the product owns for coaches.
 */
export class OrganiserDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  about!: string | null;

  @ApiProperty({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  contactEmail!: string | null;

  @ApiProperty({ type: String, nullable: true })
  contactPhone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  websiteUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  areaId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  venueName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  venueAddress!: string | null;

  @ApiProperty({ description: "Visible publicly. False means waiting on an admin." })
  approved!: boolean;

  @ApiProperty({ description: "Taken down. Different from never approved, and says so." })
  isSuspended!: boolean;
}

/**
 * What an organiser may write about themselves.
 *
 * `approved` and `isSuspended` are absent on purpose, and not merely
 * undocumented: the column grant in phase3e withholds them from every caller,
 * so a request naming them would be refused by Postgres even if this DTO let
 * it through. Two layers saying the same thing, which is the point.
 */
export class UpdateOrganiserDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  about?: string;

  @ApiPropertyOptional({ format: "uri" })
  @IsOptional()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  logoUrl?: string;

  @ApiPropertyOptional({ format: "email" })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: "9876543210" })
  @IsOptional()
  // Deliberately loose. Indian numbers arrive with +91, spaces and dashes in
  // every combination, and a strict pattern here would reject valid numbers
  // to enforce a format nothing downstream depends on.
  @Matches(/^[0-9+\-\s()]{6,20}$/, { message: "That doesn't look like a phone number." })
  contactPhone?: string;

  @ApiPropertyOptional({ format: "uri" })
  @IsOptional()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  websiteUrl?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(0, 120)
  venueName?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  venueAddress?: string;
}
