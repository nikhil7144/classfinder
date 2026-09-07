import AuthForm from "@/components/AuthForm";
import { BRAND } from "@/lib/brand";

export default function OrganiserSignupPage() {
  return (
    <AuthForm
      eyebrow="For event companies"
      heading={`Run events on ${BRAND.name}`}
      subheading="Enter your email and we'll send you a one-time code — no password needed."
      intendedRole="organiser"
    />
  );
}
