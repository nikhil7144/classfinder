import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/auth_rules.dart';
import '../../flavor.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/primary_button.dart';

/// Email, then a six-digit code.
///
/// A code rather than a link, deliberately. The link path needs
/// assetlinks.json, an Apple App Site Association file and the build machine's
/// SHA-1 fingerprints before it can come back into the app at all; the code
/// path needs none of that and works today. Google sign-in lands in the same
/// place once that native config exists — see MOBILE-PLAN.md §5.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

enum _Step { email, code }

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();

  _Step _step = _Step.email;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final email = _email.text.trim();
    if (!isValidEmail(email)) {
      setState(() => _error = 'Enter a valid email address.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref.read(authRepositoryProvider).sendCode(email);
      if (mounted) setState(() => _step = _Step.code);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    if (_code.text.trim().isEmpty) {
      setState(() => _error = 'Enter the code we emailed you.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref
          .read(authRepositoryProvider)
          .verifyCode(email: _email.text, code: _code.text);
      // No navigation here. The router redirects on the auth stream, so one
      // place decides where a signed-in person belongs — and it is the same
      // place that handles a session appearing for any other reason.
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final onCode = _step == _Step.code;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Align(
                      alignment: Alignment.centerLeft,
                      child: Wordmark(height: 38)),
                  const SizedBox(height: 36),
                  Eyebrow(
                      appFlavor.isProvider ? 'For coaches' : 'For families'),
                  const SizedBox(height: 12),
                  Text(
                    onCode ? 'Enter your code' : 'Sign in',
                    style: Theme.of(context).textTheme.headlineLarge,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    onCode
                        ? 'We sent a code to ${_email.text.trim()}.'
                        : 'We will email you a code. No password to remember.',
                    style: const TextStyle(color: A91.muted, height: 1.55),
                  ),
                  const SizedBox(height: 28),
                  if (_error != null) ...[
                    _ErrorBanner(_error!),
                    const SizedBox(height: 16),
                  ],
                  if (onCode)
                    TextField(
                      controller: _code,
                      keyboardType: TextInputType.number,
                      autofocus: true,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 20, letterSpacing: 8),
                      decoration: const InputDecoration(hintText: 'Code'),
                      onSubmitted: (_) => _verify(),
                    )
                  else
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(hintText: 'Email'),
                      onSubmitted: (_) => _send(),
                    ),
                  const SizedBox(height: 18),
                  PrimaryButton(
                    label: onCode ? 'Verify and continue' : 'Send code',
                    busy: _busy,
                    onPressed: _busy ? null : (onCode ? _verify : _send),
                  ),
                  if (onCode) ...[
                    const SizedBox(height: 14),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                                _step = _Step.email;
                                _code.clear();
                                _error = null;
                              }),
                      child: const Text('Use a different email'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner(this.message);

  final String message;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: A91.dangerSoft,
          border: Border.all(color: A91.danger.withValues(alpha: 0.4)),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          message,
          style:
              const TextStyle(color: A91.danger, fontWeight: FontWeight.w500),
        ),
      );
}
