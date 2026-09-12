import 'package:aspire91/src/data/auth_rules.dart';
import 'package:flutter_test/flutter_test.dart';

/// Changing the address you sign in with.
///
/// There is no password in this product, so the email is the credential and
/// this is the only credential action there is. Getting it wrong locks
/// somebody out of their own account, which is why the no-op case is checked
/// as carefully as the invalid one.

void main() {
  group('what counts as an address', () {
    test('an ordinary one does', () {
      expect(isValidEmail('aarav@example.com'), isTrue);
      expect(isValidEmail('  aarav@example.com  '), isTrue);
      expect(isValidEmail('a.b+tag@sub.example.co.in'), isTrue);
    });

    test('the three shapes that are certainly wrong do not', () {
      expect(isValidEmail('aarav'), isFalse);
      expect(isValidEmail('aarav@example'), isFalse);
      expect(isValidEmail('aarav @example.com'), isFalse);
    });
  });

  group('changing it', () {
    test('nothing typed is not a change', () {
      expect(
        emailChangeProblem(current: 'a@example.com', next: '   '),
        'Enter a valid email address.',
      );
    });

    test('the same address back is refused rather than confirmed', () {
      // Emailing a confirmation for a change that is not one teaches people
      // the confirmation means nothing.
      expect(
        emailChangeProblem(current: 'a@example.com', next: 'a@example.com'),
        "That's already your email address.",
      );
    });

    test('a capital does not make it a different inbox', () {
      expect(
        emailChangeProblem(current: 'a@example.com', next: ' A@Example.com '),
        "That's already your email address.",
      );
    });

    test('a real change has nothing to say', () {
      expect(
        emailChangeProblem(current: 'a@example.com', next: 'b@example.com'),
        isNull,
      );
    });
  });
}
