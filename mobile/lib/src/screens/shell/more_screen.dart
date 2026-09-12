import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../config/env.dart';

import '../../data/models/me.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../events/events_screen.dart';
import '../listing/listing_screen.dart';
import '../settings/settings_screen.dart';

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
            // Only once parents can actually reach the page. Before approval
            // the profile answers notFound(), so sharing it any earlier hands
            // a coach a link to a 404 and lets them send it to thirty people.
            if (_listingIsLive(me))
              _Item(
                icon: Icons.ios_share,
                title: 'Share your page',
                subtitle: 'Send your listing to parents you already know.',
                onTap: () => Share.share(
                  '${me!.provider!.displayName ?? 'My classes'} on Aspire91 — '
                  'classes, fees and timings: '
                  '${Env.siteUrl}/provider/${me.provider!.id}',
                  subject: 'My Aspire91 listing',
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
            _Item(
              icon: Icons.settings_outlined,
              title: 'Settings',
              subtitle: 'The email you sign in with.',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              ),
            ),
            const SizedBox(height: 26),
            _SignOut(onTap: () => confirmSignOut(context, ref)),
          ],
        ),
      ),
    );
  }

  /// Approved, not taken down, and finished — the same three conditions the
  /// web gates its share button on, because they are the conditions under
  /// which the page exists at all.
  static bool _listingIsLive(Me? me) {
    final provider = me?.provider;
    return me?.profileComplete == true &&
        provider != null &&
        provider.approved &&
        !provider.isSuspended;
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
