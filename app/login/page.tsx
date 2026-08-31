import AuthForm from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <AuthForm
      eyebrow="Welcome"
      heading="Log in or sign up"
      subheading="One flow for everyone — we'll email you a one-time code. New here? This creates your account too."
    />
  );
}
