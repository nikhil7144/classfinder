import { ApiProperty } from "@nestjs/swagger";

export class CityRefDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Indore" })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: "Madhya Pradesh" })
  state!: string | null;
}

export class AreaRefDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  cityId!: string;

  @ApiProperty({ example: "Vijay Nagar" })
  name!: string;

  @ApiProperty({ type: Number, nullable: true, description: "Centroid, the fallback search origin." })
  lat!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  lng!: number | null;

  @ApiProperty({
    description:
      "Open to seekers. Providers may register in an area before it opens, so this is a " +
      "flag rather than a filter — the seeker-facing screens honour it, signup does not.",
  })
  isLive!: boolean;
}

export class ServiceCategoryRefDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Bharatanatyam" })
  name!: string;

  @ApiProperty({
    example: "dance",
    description: "One of the eight taxonomy groups. Drives the colour a category renders in.",
  })
  group!: string;
}

export class ProviderCategoryRefDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "Dance Teacher" })
  name!: string;

  @ApiProperty({ enum: ["individual", "institution"] })
  providerType!: string;
}

export class TeachingPlaceRefDto {
  @ApiProperty({ example: "individual_classes", description: "A short text id, not a uuid." })
  id!: string;

  @ApiProperty({ example: "One-to-one" })
  label!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  sortOrder!: number;
}

/**
 * Everything the pickers need, in one call.
 *
 * These five tables were read separately from two dozen places, each screen
 * fetching the slice it wanted on mount. They are public, small, identical for
 * everyone, and change only when an admin edits them — so they are one cached
 * response instead, and a client fetches it once at startup.
 */
export class ReferenceDto {
  @ApiProperty({ type: [CityRefDto] })
  cities!: CityRefDto[];

  @ApiProperty({ type: [AreaRefDto] })
  areas!: AreaRefDto[];

  @ApiProperty({ type: [ServiceCategoryRefDto] })
  serviceCategories!: ServiceCategoryRefDto[];

  @ApiProperty({ type: [ProviderCategoryRefDto] })
  providerCategories!: ProviderCategoryRefDto[];

  @ApiProperty({ type: [TeachingPlaceRefDto] })
  teachingPlaces!: TeachingPlaceRefDto[];
}
