import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/auth_rules.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/primary_button.dart';
import '../listing/fields.dart';

/// Sign-in and account — /account/settings.
///
/// Shared by both apps, because the login is the same login.
///
/// There is deliberately no password here. Aspire91 signs people in with an
/// emailed code or with Google, so a password set on this screen could never
/// be used to get in — offering one would be a trap. The email address *is*
/// the credential, which is why changing it is the only credential action on
/// the screen, and why the wording is careful that nothing has changed until
/// the new address is confirmed.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  String _next = '';
  bool _busy = false;
  String? _error;
  String? _sent;

  Future<void> _changeEmail() async {
    final auth = ref.read(authRepositoryProvider);
    final problem = emailChangeProblem(current: auth.email, next: _next);

    setState(() {
      _error = problem;
      _sent = null;
    });
    if (problem != null || _busy) return;

    setState(() => _busy = true);
    final to = _next.trim();
    try {
      await auth.changeEmail(to);
      if (!mounted) return;
      setState(() {
        _sent = "We've emailed $to to confirm the change. Your current "
            'address keeps working until you confirm.';
        _next = '';
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final current = ref.read(authRepositoryProvider).email;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(4, 4, 4, 16),
              child: Text(
                'You sign in with a one-time code sent to your email, or with '
                "Google — there's no password to manage.",
                style: TextStyle(color: A91.muted, fontSize: 13.5, height: 1.6),
              ),
            ),
            Section(
              title: 'Email address',
              subtitle:
                  'This is how you sign in, so changing it changes your login.',
              children: [
                Field(
                  label: 'Current',
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: A91.surface2,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: A91.borderSoft),
                    ),
                    child: Text(
                      current.isEmpty ? '…' : current,
                      style: const TextStyle(
                        color: A91.ink,
                        fontSize: 13.5,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ),
                ),
                Field(
                  label: 'New email address',
                  child: TextInput(
                    initial: _next,
                    hintText: 'you@example.com',
                    keyboardType: TextInputType.emailAddress,
                    maxLength: 254,
                    onChanged: (v) => setState(() => _next = v),
                  ),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12, left: 2),
                    child: Text(
                      _error!,
                      style: const TextStyle(
                          color: A91.danger, fontSize: 13, height: 1.5),
                    ),
                  ),
                if (_sent != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 14),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: A91.teal.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: A91.teal.withValues(alpha: .3)),
                    ),
                    child: Text(
                      _sent!,
                      style: const TextStyle(
                          color: A91.teal, fontSize: 13, height: 1.5),
                    ),
                  ),
                PrimaryButton(
                  label: _busy ? 'Sending…' : 'Change email',
                  busy: _busy,
                  onPressed:
                      _next.trim().isEmpty || _busy ? null : _changeEmail,
                ),
              ],
            ),
            Section(
              title: 'Sign out',
              subtitle: 'Sign out on this device.',
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton(
                    onPressed: () => confirmSignOut(context, ref),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: A91.muted,
                      side: const BorderSide(color: A91.border),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 20, vertical: 13),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    child: const Text('Log out'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            const Center(child: Wordmark()),
          ],
        ),
      ),
    );
  }
}

/// Ask, then sign out. Offered in three places — both shells and this screen —
/// so it is written once: a confirmation people meet in one wording and then
/// meet again in another is a confirmation they stop reading.
Future<void> confirmSignOut(BuildContext context, WidgetRef ref) async {
  final sure = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      backgroundColor: A91.surface,
      title: const Text('Sign out?'),
      content: const Text(
        'You will need your email to get back in.',
        style: TextStyle(color: A91.muted, height: 1.5),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Stay', style: TextStyle(color: A91.muted)),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text(
            'Sign out',
            style: TextStyle(color: A91.danger, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
  // The router listens to the auth stream, so signing out is all this has to
  // do — the app moves on its own.
  if (sure == true) await ref.read(authRepositoryProvider).signOut();
}
