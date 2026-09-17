import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/auth_rules.dart';
import '../../flavor.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/primary_button.dart';

/// Email, then a six-digit code — plus Google, once configured.
///
/// The code is the primary path and needs nothing beyond what ships today.
/// Google sign-in is native (`AuthRepository.signInWithGoogle`) and needs no
/// deep link of its own; it only appears once `Env.googleWebClientId` is set,
/// which needs a Google Cloud Console client and Supabase's Google provider
/// configured with it — see README §7/§10.4.
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

  Future<void> _signInWithGoogle() async {
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref.read(authRepositoryProvider).signInWithGoogle();
      // No navigation here either — same reason as _verify: the router
      // reacts to the session appearing, wherever it came from.
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
                      child: Wordmark(height: 45)),
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
                  // Hidden entirely rather than shown disabled: a build with
                  // no GOOGLE_WEB_CLIENT_ID has nothing this button could do,
                  // and a button that always fails is worse than no button.
                  if (!onCode &&
                      ref.read(authRepositoryProvider).googleSignInAvailable) ...[
                    const SizedBox(height: 22),
                    Row(
                      children: [
                        Expanded(
                            child: Divider(color: A91.muted.withValues(alpha: 0.3))),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 12),
                          child: Text('or', style: TextStyle(color: A91.muted)),
                        ),
                        Expanded(
                            child: Divider(color: A91.muted.withValues(alpha: 0.3))),
                      ],
                    ),
                    const SizedBox(height: 18),
                    // Matches the web's .cf-btn-ghost exactly (ink on
                    // surface-2, a border, a full pill) rather than the
                    // default OutlinedButton, which reads its text and icon
                    // colour from colorScheme.primary — this app's coral CTA
                    // colour. Google's button is neutral on every platform;
                    // it must never look like it is trying to be the primary
                    // action.
                    OutlinedButton.icon(
                      onPressed: _busy ? null : _signInWithGoogle,
                      icon: const GoogleMark(),
                      label: const Text('Continue with Google'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: A91.ink,
                        backgroundColor: A91.surface2,
                        side: const BorderSide(color: A91.border),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: const StadiumBorder(),
                        textStyle: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 14.5),
                      ),
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
