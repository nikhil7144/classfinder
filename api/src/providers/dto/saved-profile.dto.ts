import { ApiProperty } from "@nestjs/swagger";

/**
 * What a coach gets back after saving.
 *
 * Deliberately not the public profile. get_provider_profile() answers null for
 * a listing that is unapproved, suspended, or an event planner's — so reading
 * a first save back through it would 404 the very thing that just succeeded.
 *
 * This is the owner's own row instead, and it carries the two facts they need
 * next: whether anyone can see them yet, and why not.
 */
export class SavedProfileDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ description: "False until an admin reads the listing. A first save is always false." })
  approved!: boolean;

  @ApiProperty({ description: "Taken down. Different from never approved, and says so." })
  isSuspended!: boolean;
}
