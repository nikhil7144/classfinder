import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../flavor.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/primary_button.dart';

/// What kind of account this is, asked once.
///
/// Reached only by somebody who signed in and has no role yet — a brand-new
/// account. Until PUT /me/role existed this screen could not exist either, and
/// the app sent them to the website to finish.
///
/// The flavor decides what is on offer, so nobody is asked a question the app
/// they installed has already answered. A coach build offers coaching and
/// running events; a families build offers only itself and the choice is a
/// confirmation rather than a fork.
class ChooseRoleScreen extends ConsumerStatefulWidget {
  const ChooseRoleScreen({super.key});

  @override
  ConsumerState<ChooseRoleScreen> createState() => _ChooseRoleScreenState();
}

class _ChooseRoleScreenState extends ConsumerState<ChooseRoleScreen> {
  String? _choice;
  bool _busy = false;
  String? _error;

  List<_Option> get _options => appFlavor.isProvider
      ? const [
          _Option(
            role: 'provider',
            title: 'I teach',
            body:
                'A coach, a tutor, or an academy. Families near you will be able to find you.',
          ),
          _Option(
            role: 'organiser',
            title: 'I run events',
            body: 'Tournaments, workshops and showcases. No teaching listing.',
          ),
        ]
      : const [
          _Option(
            role: 'seeker',
            title: 'I am looking for classes',
            body: 'For your child, or for yourself.',
          ),
        ];

  Future<void> _submit() async {
    final role = _choice;
    if (role == null) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref.read(meRepositoryProvider).chooseRole(role);
      // The gate watches meProvider, so refreshing it is the whole of the
      // navigation. Nothing here decides where to go next.
      ref.invalidate(meProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void initState() {
    super.initState();
    // One option is not a question. Preselect it so the screen reads as a
    // confirmation, which is what it is.
    if (_options.length == 1) _choice = _options.first.role;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Wordmark(height: 36),
                  ),
                  const SizedBox(height: 34),
                  const Eyebrow('One last thing'),
                  const SizedBox(height: 12),
                  Text(
                    'What brings you here?',
                    style: Theme.of(context).textTheme.headlineLarge,
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'This sets up your account. It is not something you can casually '
                    'change later, so pick the one that fits.',
                    style: TextStyle(color: A91.muted, height: 1.55),
                  ),
                  const SizedBox(height: 26),
                  for (final option in _options) ...[
                    _Choice(
                      option: option,
                      selected: _choice == option.role,
                      onTap: _busy
                          ? null
                          : () => setState(() => _choice = option.role),
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      _error!,
                      style: const TextStyle(
                          color: A91.danger, fontWeight: FontWeight.w500),
                    ),
                    const SizedBox(height: 12),
                  ],
                  const SizedBox(height: 10),
                  PrimaryButton(
                    label: 'Continue',
                    busy: _busy,
                    onPressed: _choice == null || _busy ? null : _submit,
                  ),
                  const SizedBox(height: 14),
                  Center(
                    child: TextButton(
                      onPressed: _busy
                          ? null
                          : () => ref.read(authRepositoryProvider).signOut(),
                      child: const Text('Sign out'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Option {
  const _Option({required this.role, required this.title, required this.body});

  final String role;
  final String title;
  final String body;
}

class _Choice extends StatelessWidget {
  const _Choice({required this.option, required this.selected, this.onTap});

  final _Option option;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? A91.surface2 : A91.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            // The selected border is coral, which is the one decorative use of
            // it the palette allows: it marks the thing about to be acted on.
            border: Border.all(color: selected ? A91.grad1 : A91.border),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                selected
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked,
                size: 20,
                color: selected ? A91.grad1 : A91.faint,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      option.title,
                      style: const TextStyle(
                        color: A91.ink,
                        fontWeight: FontWeight.w700,
                        fontSize: 15.5,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      option.body,
                      style: const TextStyle(
                          color: A91.muted, height: 1.5, fontSize: 13.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
