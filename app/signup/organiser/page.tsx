import AuthForm from "@/components/AuthForm";

export default function OrganiserSignupPage() {
  return (
    <AuthForm
      eyebrow="For event companies"
      heading="Run events on ClassFinder"
      subheading="Enter your email and we'll send you a one-time code — no password needed."
      intendedRole="organiser"
    />
  );
}
