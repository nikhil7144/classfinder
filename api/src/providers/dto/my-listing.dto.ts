import { ApiProperty } from "@nestjs/swagger";
import { AvailabilitySlotDto, CertificationDto, PROVIDER_TYPES } from "./provider.dto";

export class MyBranchDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  label!: string | null;

  @ApiProperty({ type: String, nullable: true })
  address!: string | null;

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  areaId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;
}

/**
 * A coach's own listing, as they edit it.
 *
 * Deliberately not ProviderProfileDto. That one is the public view and comes
 * from get_provider_profile(), which answers null while a listing is
 * unapproved — so the screen where a new coach fills in their details could
 * never load through it. This reads the owner's own rows instead.
 *
 * The field names match SaveProviderProfileDto so a client can load, edit and
 * send it back without a translation layer in between. `approved`,
 * `isSuspended` and `profileComplete` are the exceptions: they are state, not
 * input, and the save endpoint refuses them.
 */
export class MyListingDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: PROVIDER_TYPES })
  providerType!: string;

  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  providerCategoryId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  bio!: string | null;

  @ApiProperty({ type: String, nullable: true })
  helpStatement!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  age!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  experienceYears!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  feeMin!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  feeMax!: number | null;

  @ApiProperty({ type: String, nullable: true })
  feePeriod!: string | null;

  @ApiProperty({ type: String, nullable: true })
  feesNote!: string | null;

  @ApiProperty({ type: [String] })
  teachingPlaces!: string[];

  @ApiProperty()
  travelsToStudents!: boolean;

  @ApiProperty({ type: [CertificationDto] })
  certifications!: CertificationDto[];

  @ApiProperty({ type: [AvailabilitySlotDto] })
  availability!: AvailabilitySlotDto[];

  @ApiProperty({ type: [String], format: "uuid" })
  serviceCategoryIds!: string[];

  @ApiProperty({ type: String, nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ type: [MyBranchDto], description: "Institutions. Empty for anybody else." })
  branches!: MyBranchDto[];

  @ApiProperty({ type: [String], format: "uuid", description: "Individuals. Empty for an institution." })
  serviceAreaIds!: string[];

  @ApiProperty({ description: "False until an admin has read it. Not the caller's to change." })
  approved!: boolean;

  @ApiProperty({ description: "Taken down. Different from never approved." })
  isSuspended!: boolean;

  @ApiProperty({ description: "Whether the listing has ever been saved in full." })
  profileComplete!: boolean;
}
