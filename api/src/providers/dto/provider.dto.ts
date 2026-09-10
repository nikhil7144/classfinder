import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from "class-validator";

export const PROVIDER_TYPES = ["individual", "institution", "event_planner"] as const;

/**
 * What a parent searched for.
 *
 * Every field is optional because search_providers() defaults all of them: no
 * origin falls back to the area centroid, no service means every service. The
 * query arrives as strings, so the numeric ones are coerced before validation.
 */
export class ProviderSearchQueryDto {
  @ApiPropertyOptional({ description: "Search origin. Both or neither; falls back to the area." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({ format: "uuid", description: "The area to search in." })
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  serviceCategoryId?: string;

  @ApiPropertyOptional({ enum: PROVIDER_TYPES })
  @IsOptional()
  @IsIn(PROVIDER_TYPES)
  providerType?: string;

  @ApiPropertyOptional({ default: 15, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  radiusKm?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** One row of results, ordered by distance from the search origin. */
export class ProviderSearchResultDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  bio!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "What they say they can help with." })
  helpStatement!: string | null;

  @ApiProperty({ enum: PROVIDER_TYPES })
  providerType!: string;

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  providerCategoryId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  photoUrl!: string | null;

  @ApiProperty()
  isFeatured!: boolean;

  @ApiProperty({ type: [String], format: "uuid" })
  serviceCategoryIds!: string[];

  @ApiProperty({ type: Number, nullable: true })
  experienceYears!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  feeMin!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  feeMax!: number | null;

  @ApiProperty({ type: String, nullable: true, example: "per_month" })
  feePeriod!: string | null;

  @ApiProperty({ type: [String], description: "Where they teach — own centre, at home, online." })
  teachingPlaces!: string[];

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  nearestAreaId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  nearestAreaName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cityName!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: "Kilometres from the origin." })
  distanceKm!: number | null;
}

export class ProviderServiceDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: "Which taxonomy group it belongs to — sport, subject, and so on." })
  group!: string;
}

export class ProviderBranchDto {
  @ApiProperty({ type: String, nullable: true })
  label!: string | null;

  @ApiProperty({ type: String, nullable: true })
  address!: string | null;

  @ApiProperty({ type: String, nullable: true })
  areaName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cityName!: string | null;
}

export class ProviderServiceAreaDto {
  @ApiProperty({ type: String, nullable: true })
  areaName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cityName!: string | null;
}

export class CertificationDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  issuer!: string;

  @ApiProperty({ description: "Kept as text: parents write '2019' and 'expected 2027' alike." })
  year!: string;
}

/** One block of time, at one place, on one day. */
export class AvailabilitySlotDto {
  @ApiProperty({ example: "mon" })
  day!: string;

  @ApiProperty({ description: "Which of the coach's teaching places this slot is at." })
  place!: string;

  @ApiProperty({ example: "16:00" })
  start!: string;

  @ApiProperty({ example: "18:00" })
  end!: string;
}

/**
 * A coach's public profile.
 *
 * get_provider_profile() states the visibility rule once — approved, not
 * suspended, not an event planner — and returns null when it fails. The
 * service turns that into a 404 rather than re-checking it here, which would
 * be a second copy of a rule that already holds.
 */
export class ProviderProfileDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  bio!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "What they say they can help with." })
  helpStatement!: string | null;

  @ApiProperty({ enum: PROVIDER_TYPES })
  providerType!: string;

  @ApiProperty({ type: String, nullable: true })
  photoUrl!: string | null;

  @ApiProperty()
  isFeatured!: boolean;

  @ApiProperty({ type: Number, nullable: true })
  age!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  experienceYears!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  feeMin!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  feeMax!: number | null;

  @ApiProperty({ type: String, nullable: true, example: "month" })
  feePeriod!: string | null;

  @ApiProperty({ type: String, nullable: true })
  feesNote!: string | null;

  @ApiProperty({ type: [String], description: "Where they teach — at their centre, at home, online." })
  teachingPlaces!: string[];

  @ApiProperty({ type: [CertificationDto] })
  certifications!: CertificationDto[];

  @ApiProperty({ type: [AvailabilitySlotDto] })
  availability!: AvailabilitySlotDto[];

  @ApiProperty({ type: String, nullable: true, description: "Their provider category, by name." })
  categoryName!: string | null;

  @ApiProperty({ type: [ProviderServiceDto] })
  services!: ProviderServiceDto[];

  @ApiProperty({ type: [ProviderBranchDto] })
  branches!: ProviderBranchDto[];

  @ApiProperty({ type: [ProviderServiceAreaDto] })
  serviceAreas!: ProviderServiceAreaDto[];
}
