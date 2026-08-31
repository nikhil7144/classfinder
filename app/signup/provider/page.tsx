import AuthForm from "@/components/AuthForm";

export default function ProviderSignupPage() {
  return (
    <AuthForm
      eyebrow="For coaches, tutors & centers"
      heading="List your services"
      subheading="Enter your email and we'll send you a one-time code — no password needed."
      intendedRole="provider"
    />
  );
}
