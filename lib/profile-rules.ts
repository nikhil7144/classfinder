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
  city: string;
};

export type SeekerProfileFieldErrors = Partial<Record<"name" | "phone" | "city", string[]>>;

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
  if (!hasValue(input.city)) addError("city", "City is required.");

  return errors;
}

// ---------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------

export type ProviderBranchInput = {
  label: string;
  address: string;
  city: string;
  area: string;
  phone: string;
};

type ProviderProfileInput = {
  providerType: "individual" | "institution" | "event_planner" | "";
  providerCategoryId: string | null;
  displayName: string;
  bio: string;
  phone: string;
  city: string;
  serviceCategoryIds: string[];
  photoUrl: string | null;
  branches: ProviderBranchInput[];
};

export type ProviderProfileFieldErrors = Partial<
  Record<
    | "providerType"
    | "providerCategoryId"
    | "displayName"
    | "bio"
    | "phone"
    | "city"
    | "serviceCategoryIds"
    | "photoUrl"
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

export function getProviderProfileFieldErrors(
  input: ProviderProfileInput
): ProviderProfileFieldErrors {
  const errors: ProviderProfileFieldErrors = {};
  const addError = (field: keyof ProviderProfileFieldErrors, message: string) => {
    errors[field] = [...(errors[field] || []), message];
  };

  if (!input.providerType) {
    addError("providerType", "Select what kind of provider you are.");
  }

  // Event planners have no category layer (see plan) — only individual/institution need one.
  if (input.providerType !== "event_planner" && !input.providerCategoryId) {
    addError("providerCategoryId", "Select a category.");
  }

  if (!hasValue(input.displayName)) addError("displayName", "Name is required.");
  if (!hasValue(input.bio)) addError("bio", "A short bio is required.");
  if (!hasValue(input.phone)) addError("phone", "Mobile number is required.");

  // Institutions don't have their own city field in the UI — their city is
  // resolved from the first branch instead, and validated via the branches
  // check below.
  if (input.providerType !== "institution" && !hasValue(input.city)) {
    addError("city", "City is required.");
  }

  if (input.serviceCategoryIds.length === 0) {
    addError("serviceCategoryIds", "Select at least one thing you teach or coach.");
  }

  if (!input.photoUrl) addError("photoUrl", "A profile photo is required.");

  if (input.providerType === "institution") {
    const hasValidBranch = input.branches.some(
      (branch) => hasValue(branch.label) && hasValue(branch.address) && hasValue(branch.city)
    );

    if (!hasValidBranch) {
      addError("branches", "Add at least one branch with a name, address, and city.");
    }
  }

  return errors;
}

export function shouldMarkProviderPendingApproval(isFirstProfileSave: boolean) {
  return isFirstProfileSave || REAPPROVE_PROVIDER_PROFILE_ON_EVERY_EDIT;
}
