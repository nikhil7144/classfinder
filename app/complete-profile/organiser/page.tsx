import OrganiserProfileForm from "@/components/organiser/OrganiserProfileForm";

// First-time setup, standalone. Editing later happens at /account/profile,
// inside the account section, using the same form.
export default function CompleteOrganiserProfilePage() {
  return <OrganiserProfileForm redirectTo="/dashboard" variant="setup" />;
}
