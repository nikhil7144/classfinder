import AuthForm from "@/components/AuthForm";

export default function SeekerSignupPage() {
  return (
    <AuthForm
      eyebrow="For parents & students"
      heading="Find a coach or tutor"
      subheading="Enter your email and we'll send you a one-time code — no password needed."
      intendedRole="seeker"
    />
  );
}
