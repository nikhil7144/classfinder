import ProviderProfileForm from "@/components/provider/ProviderProfileForm";

// First-time setup, standalone. Editing later happens at /account/profile,
// inside the account section, using the same form.
export default function CompleteProviderProfilePage() {
  return <ProviderProfileForm redirectTo="/dashboard" variant="setup" />;
}
