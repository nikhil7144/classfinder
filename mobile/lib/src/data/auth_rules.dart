/// Email, which in this product is the login.
///
/// There is deliberately no password anywhere in Aspire91 — people sign in
/// with a code sent to their email, or with Google. So the email address is
/// the credential, and changing it is the one credential action there is.
///
/// The pattern is the web's, from app/account/settings/page.tsx. It is loose
/// on purpose: an address is only really validated by a code arriving at it,
/// and a stricter rule here would turn away real addresses for the sake of
/// catching typos the code already catches.
library;

final emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

bool isValidEmail(String email) => emailPattern.hasMatch(email.trim());

/// What is wrong with a change of email, in the web's words, or null when
/// there is nothing to say.
String? emailChangeProblem({required String current, required String next}) {
  final trimmed = next.trim();
  if (trimmed.isEmpty || !isValidEmail(trimmed)) {
    return 'Enter a valid email address.';
  }
  // Case-insensitively: nobody's inbox changes because they typed a capital,
  // and sending a confirmation for a no-op change is a small betrayal of the
  // word "change".
  if (trimmed.toLowerCase() == current.trim().toLowerCase()) {
    return "That's already your email address.";
  }
  return null;
}
