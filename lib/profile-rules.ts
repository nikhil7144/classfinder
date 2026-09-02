export const REAPPROVE_PROVIDER_PROFILE_ON_EVERY_EDIT = false;

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

// ---------------------------------------------------------------------
// Seeker
// ---------------------------------------------------------------------

type SeekerProfileInput = {
  name: string;
  phone: string;
  areaId: string | null;
  /**
   * Who they're looking for classes for. Required, and asked here rather than
   * with the requirement, because it is a fact about the person: a father is
   * a father whether or not he is searching this month. Asked inside the
   * optional requirement block it was answered by nobody who skipped that
   * block, and left attached to nothing by anyone who later cleared it.
   *
   * Required because the answer changes what a coach is being asked to do —
   * teaching a 26-year-old beginner and teaching someone's six-year-old are
   * different jobs, and a coach reading an enquiry should not have to guess
   * which one they have been offered.
   */
  relation: string;
};

export type SeekerProfileFieldErrors = Partial<
  Record<"name" | "phone" | "areaId" | "relation", string[]>
>;

export function validateSeekerProfile(input: SeekerProfileInput) {
  return Object.values(getSeekerProfileFieldErrors(input)).flat();
}

export function isSeekerProfileComplete(input: SeekerProfileInput) {
  return validateSeekerProfile(input).length === 0;
}

export function getSeekerProfileFieldErrors(input: SeekerProfileInput): SeekerProfileFieldErrors {
  const errors: SeekerProfileFieldErrors = {};
  const addError = (field: keyof SeekerProfileFieldErrors, message: string) => {
    errors[field] = [...(errors[field] || []), message];
  };

  if (!hasValue(input.name)) addError("name", "Name is required.");
  if (!hasValue(input.phone)) addError("phone", "Mobile number is required.");
  if (!input.areaId) addError("areaId", "Choose the area you're looking in.");
  if (!hasValue(input.relation)) addError("relation", "Tell us who you're looking for.");

  return errors;
}

// ---------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------

export const FEE_PERIODS = [
  { value: "per_hour", label: "per hour" },
  { value: "per_session", label: "per session" },
  { value: "per_month", label: "per month" },
  { value: "per_course", label: "per course" },
] as const;

export const WEEK_DAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

export type ProviderBranchInput = {
  label: string;
  address: string;
  areaId: string | null;
  phone: string;
};

export type CertificationInput = {
  name: string;
  issuer: string;
  year: string;
};

/** One block of time, at one place, on one day. */
export type AvailabilitySlotInput = {
  day: string;
  place: string;
  start: string;
  end: string;
};

export const emptyBranch = (): ProviderBranchInput => ({
  label: "",
  address: "",
  areaId: null,
  phone: "",
});

export const emptyCertification = (): CertificationInput => ({ name: "", issuer: "", year: "" });

export const emptyAvailabilitySlot = (): AvailabilitySlotInput => ({
  day: "mon",
  place: "",
  start: "16:00",
  end: "18:00",
});

type ProviderProfileInput = {
  providerType: "individual" | "institution" | "event_planner" | "";
  providerCategoryId: string | null;
  displayName: string;
  bio: string;
  helpStatement: string;
  phone: string;
  age: string;
  experienceYears: string;
  feeMin: string;
  feeMax: string;
  feePeriod: string;
  teachingPlaces: string[];
  /**
   * Individuals only: do they go to the student, or does the student come to
   * them? Null means unanswered.
   *
   * Separate from teachingPlaces because that list is about FORMAT — group or
   * one-to-one — and format says nothing about venue. Someone can run group
   * batches at their own academy and someone else travels to run them. It was
   * being inferred from the format list, and the inference put areas a coach
   * never visits into their availability. See phase2u.
   */
  travelsToStudents: boolean | null;
  certifications: CertificationInput[];
  availability: AvailabilitySlotInput[];
  serviceCategoryIds: string[];
  photoUrl: string | null;
  /** Individuals: the areas they serve. Institutions use branch areas instead. */
  serviceAreaIds: string[];
  branches: ProviderBranchInput[];
};

export type ProviderProfileFieldErrors = Partial<
  Record<
    | "providerType"
    | "providerCategoryId"
    | "displayName"
    | "bio"
    | "helpStatement"
    | "phone"
    | "age"
    | "experienceYears"
    | "fees"
    | "teachingPlaces"
    | "travelsToStudents"
    | "certifications"
    | "availability"
    | "serviceCategoryIds"
    | "photoUrl"
    | "serviceAreaIds"
    | "branches",
    string[]
  >
>;

export function validateProviderProfile(input: ProviderProfileInput) {
  return Object.values(getProviderProfileFieldErrors(input)).flat();
}

export function isProviderProfileComplete(input: ProviderProfileInput) {
  return validateProviderProfile(input).length === 0;
}

/** Blank rows are ignored rather than treated as errors — the repeaters start with one. */
export const isBlankCertification = (c: CertificationInput) =>
  !c.name.trim() && !c.issuer.trim() && !c.year.trim();

export const isBlankBranch = (b: ProviderBranchInput) =>
  !b.label.trim() && !b.address.trim() && !b.areaId && !b.phone.trim();

type ParsedInt =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "ok"; value: number };

function parseOptionalInt(raw: string): ParsedInt {
  if (!raw.trim()) return { kind: "empty" };
  const n = Number(raw.trim());
  if (!Number.isInteger(n)) return { kind: "invalid" };
  return { kind: "ok", value: n };
}

export function getProviderProfileFieldErrors(
  input: ProviderProfileInput
): ProviderProfileFieldErrors {
  const errors: ProviderProfileFieldErrors = {};
  const addError = (field: keyof ProviderProfileFieldErrors, message: string) => {
    errors[field] = [...(errors[field] || []), message];
  };

  const isEventPlanner = input.providerType === "event_planner";
  const isInstitution = input.providerType === "institution";

  if (!input.providerType) {
    addError("providerType", "Select what kind of provider you are.");
  }

  // Event planners have no category layer — they aren't surfaced in coach search.
  if (!isEventPlanner && !input.providerCategoryId) {
    addError("providerCategoryId", "Select a category.");
  }

  if (!hasValue(input.displayName)) addError("displayName", "Name is required.");
  if (!hasValue(input.bio)) addError("bio", "A short bio is required.");
  if (!hasValue(input.phone)) addError("phone", "Mobile number is required.");

  if (!isEventPlanner && !hasValue(input.helpStatement)) {
    addError("helpStatement", "Tell parents how you help your students.");
  }

  const age = parseOptionalInt(input.age);
  if (age.kind === "invalid") {
    addError("age", "Age must be a whole number.");
  } else if (age.kind === "ok" && (age.value < 16 || age.value > 100)) {
    addError("age", "Age must be between 16 and 100.");
  }

  const experience = parseOptionalInt(input.experienceYears);
  if (experience.kind === "invalid") {
    addError("experienceYears", "Experience must be a whole number of years.");
  } else if (experience.kind === "ok" && (experience.value < 0 || experience.value > 70)) {
    addError("experienceYears", "Experience must be between 0 and 70 years.");
  } else if (experience.kind === "empty" && !isEventPlanner) {
    addError("experienceYears", "Years of experience is required.");
  }

  // Fees are optional, but a partly-filled range is a mistake worth catching.
  const feeMin = input.feeMin.trim() ? Number(input.feeMin) : null;
  const feeMax = input.feeMax.trim() ? Number(input.feeMax) : null;

  if ((feeMin !== null && !Number.isFinite(feeMin)) || (feeMax !== null && !Number.isFinite(feeMax))) {
    addError("fees", "Fees must be numbers.");
  } else if (feeMin !== null && feeMax !== null && feeMax < feeMin) {
    addError("fees", "The upper fee can't be lower than the starting fee.");
  } else if ((feeMin !== null || feeMax !== null) && !input.feePeriod) {
    addError("fees", "Choose what the fee is per — hour, session, month or course.");
  }

  if (!isEventPlanner && input.teachingPlaces.length === 0) {
    addError("teachingPlaces", "Select how you run your classes.");
  }

  // Only individuals. An institution is located by its branches, and an event
  // planner is not found by area at all.
  if (!isEventPlanner && !isInstitution && input.travelsToStudents === null) {
    addError("travelsToStudents", "Tell parents whether you travel to students.");
  }

  const certs = input.certifications.filter((c) => !isBlankCertification(c));
  if (certs.some((c) => !c.name.trim())) {
    addError("certifications", "Every certification needs a name.");
  }
  if (certs.some((c) => c.year.trim() && !/^\d{4}$/.test(c.year.trim()))) {
    addError("certifications", "Certification year should be a 4-digit year.");
  }

  const slots = input.availability;
  if (slots.some((s) => !s.place)) {
    addError("availability", "Every availability slot needs a place.");
  }
  if (slots.some((s) => s.start >= s.end)) {
    addError("availability", "Availability end time must be after the start time.");
  }

  if (input.serviceCategoryIds.length === 0) {
    addError("serviceCategoryIds", "Select at least one thing you teach or coach.");
  }

  if (!input.photoUrl) addError("photoUrl", "A profile photo is required.");

  if (isInstitution) {
    // Institutions are located by their branches, so each branch carries the area.
    const branches = input.branches.filter((b) => !isBlankBranch(b));

    if (branches.length === 0) {
      addError("branches", "Add at least one branch.");
    } else {
      if (branches.some((b) => !b.label.trim())) addError("branches", "Every branch needs a name.");
      if (branches.some((b) => !b.address.trim())) addError("branches", "Every branch needs an address.");
      if (branches.some((b) => !b.areaId)) addError("branches", "Every branch needs a city and area.");
    }
  } else if (input.serviceAreaIds.length === 0) {
    addError("serviceAreaIds", "Select at least one area you serve.");
  }

  return errors;
}

export function shouldMarkProviderPendingApproval(isFirstProfileSave: boolean) {
  return isFirstProfileSave || REAPPROVE_PROVIDER_PROFILE_ON_EVERY_EDIT;
}
