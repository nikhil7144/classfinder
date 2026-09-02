import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator";
import { ReferenceDto } from "./dto/reference.dto";
import { ReferenceService } from "./reference.service";

@ApiTags("reference")
@Controller({ path: "reference", version: "1" })
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: "Cities, areas and the taxonomy, in one call",
    description:
      "Public and cached for a few minutes. Fetch once at startup and keep it — these change " +
      "only when an admin edits the taxonomy or opens an area. Areas are returned whole, with " +
      "`isLive` alongside: it gates seekers, not providers, so it is a flag and not a filter.",
  })
  @ApiOkResponse({ type: ReferenceDto })
  all(): Promise<ReferenceDto> {
    return this.reference.all();
  }
}
