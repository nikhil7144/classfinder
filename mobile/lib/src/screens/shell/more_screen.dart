import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/me.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../events/events_screen.dart';
import '../listing/listing_screen.dart';

/// Everything a coach needs occasionally rather than daily.
///
/// A NavigationBar takes five destinations and the coach app has six things.
/// The four that are opened every day keep their place in the bar; the listing
/// is edited a handful of times a year and events come round a few times a
/// season, so they live one tap deeper.
///
/// Signing out lives here too, because until now it existed only on the gate
/// and the role chooser — screens a signed-in coach never sees again.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider).value;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            const Eyebrow('Your account'),
            const SizedBox(height: 10),
            Text(
              me?.provider?.displayName ?? 'Your account',
              style: Theme.of(context)
                  .textTheme
                  .headlineLarge
                  ?.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 22),
            _Item(
              icon: Icons.badge_outlined,
              title: 'Your listing',
              subtitle: _listingState(me),
              tone: _listingTone(me),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ListingScreen()),
              ),
            ),
            _Item(
              icon: Icons.event_outlined,
              title: 'Your events',
              subtitle: 'Trials, competitions, camps — and who has entered.',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const EventsScreen()),
              ),
            ),
            const SizedBox(height: 26),
            _SignOut(
              onTap: () async {
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
                        child: const Text('Stay',
                            style: TextStyle(color: A91.muted)),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('Sign out',
                            style: TextStyle(
                                color: A91.danger,
                                fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                );
                // The router is listening to the auth stream, so signing out
                // is all this has to do — it moves on its own.
                if (sure == true) {
                  await ref.read(authRepositoryProvider).signOut();
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  static String _listingState(Me? me) {
    final provider = me?.provider;
    if (provider == null) return 'Not started. Families cannot find you yet.';
    if (provider.isSuspended) return 'Taken down.';
    if (!provider.approved) return 'Waiting for approval.';
    return 'Live. Families can find you.';
  }

  static Color? _listingTone(Me? me) {
    final provider = me?.provider;
    if (provider == null) return A91.warn;
    if (provider.isSuspended) return A91.danger;
    if (!provider.approved) return A91.warn;
    return A91.teal;
  }
}

class _Item extends StatelessWidget {
  const _Item({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.tone,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  /// Colours the subtitle only. A status is a fact about the row, not a reason
  /// to make the whole thing shout.
  final Color? tone;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: A91.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: A91.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 12, 16),
            child: Row(
              children: [
                Icon(icon, size: 21, color: A91.muted),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          color: A91.ink,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        subtitle,
                        style: TextStyle(
                            color: tone ?? A91.faint,
                            fontSize: 12.5,
                            height: 1.4),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, size: 20, color: A91.faint),
              ],
            ),
          ),
        ),
      );
}

class _SignOut extends StatelessWidget {
  const _SignOut({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Center(
        child: TextButton(
          onPressed: onTap,
          child: const Text(
            'Sign out',
            style: TextStyle(color: A91.faint, fontSize: 13.5),
          ),
        ),
      );
}
