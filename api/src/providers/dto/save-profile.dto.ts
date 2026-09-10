import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { PROVIDER_TYPES } from "./provider.dto";

export class BranchInputDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  address?: string | null;

  @ApiProperty({ format: "uuid", description: "Where it is. This is what makes it findable." })
  @IsUUID()
  areaId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  phone?: string | null;
}

export class CertificationInputDto {
  @ApiProperty()
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty()
  @IsString()
  @Length(0, 200)
  issuer!: string;

  @ApiProperty({ description: "Text, because coaches write '2019' and 'expected 2027' alike." })
  @IsString()
  @Length(0, 40)
  year!: string;
}

export class AvailabilityInputDto {
  @ApiProperty({ example: "mon" })
  @IsString()
  @Length(1, 12)
  day!: string;

  @ApiProperty({ description: "Which teaching place this slot is at." })
  @IsString()
  @Length(1, 60)
  place!: string;

  @ApiProperty({ example: "16:00" })
  @IsString()
  @Length(1, 8)
  start!: string;

  @ApiProperty({ example: "18:00" })
  @IsString()
  @Length(1, 8)
  end!: string;
}

/**
 * A coach's whole listing, saved in one call.
 *
 * The whole thing every time, not a patch. save_provider_profile() replaces
 * branches and service areas wholesale, so a partial payload would clear what
 * it omitted — which is the same replace-all the web form does, moved
 * somewhere it can be a single transaction.
 *
 * `approved` is not here and cannot be. A first save waits for an admin; an
 * edit leaves approval untouched. Neither is the client's to say.
 */
export class SaveProviderProfileDto {
  @ApiProperty({ enum: PROVIDER_TYPES })
  @IsIn(PROVIDER_TYPES)
  providerType!: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: "uuid" })
  @IsOptional()
  @IsUUID()
  providerCategoryId?: string | null;

  @ApiProperty()
  @IsString()
  @Length(2, 120)
  displayName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  bio?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  helpStatement?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 16, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(16)
  @Max(100)
  age?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: 80 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(80)
  experienceYears?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  feeMin?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  feeMax?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: "per_month" })
  @IsOptional()
  @IsString()
  @Length(1, 30)
  feePeriod?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  feesNote?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  teachingPlaces?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  travelsToStudents?: boolean;

  @ApiPropertyOptional({ type: [CertificationInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CertificationInputDto)
  certifications?: CertificationInputDto[];

  @ApiPropertyOptional({ type: [AvailabilityInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityInputDto)
  availability?: AvailabilityInputDto[];

  @ApiPropertyOptional({ type: [String], format: "uuid" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("4", { each: true })
  serviceCategoryIds?: string[];

  @ApiPropertyOptional({ type: String, nullable: true, description: "A Storage URL, never bytes." })
  @IsOptional()
  @IsString()
  photoUrl?: string | null;

  @ApiPropertyOptional({
    type: [BranchInputDto],
    description: "Institutions only. Cleared for anybody else, so a change of type is not half a listing.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => BranchInputDto)
  branches?: BranchInputDto[];

  @ApiPropertyOptional({
    type: [String],
    format: "uuid",
    description: "Individuals only. The areas they will travel to or teach in.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID("4", { each: true })
  serviceAreaIds?: string[];
}
