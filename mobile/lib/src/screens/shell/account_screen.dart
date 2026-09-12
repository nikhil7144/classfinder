import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/seeker.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../events/browse_screen.dart';
import '../groups/groups_screen.dart';
import '../profile/profile_screen.dart';

/// Everything a family needs occasionally rather than daily.
///
/// The coach app reached the same shape for the same reason: a NavigationBar
/// takes five destinations, and the things opened every day — home, search,
/// messages — earn those places. A profile is edited a handful of times a
/// year and groups come round a few times a season, so they live one tap
/// deeper.
///
/// Signing out is here too, because the only other place it exists is the gate
/// — a screen a signed-in family never sees again.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myProfileProvider).value;
    final groups = ref.watch(myGroupsProvider).value;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            const Eyebrow('Your account'),
            const SizedBox(height: 10),
            Text(
              profile?.name.trim().isNotEmpty == true
                  ? profile!.name
                  : 'Your account',
              style: Theme.of(context)
                  .textTheme
                  .headlineLarge
                  ?.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 22),
            _Item(
              icon: Icons.person_outline,
              title: 'Your profile',
              subtitle: _profileState(profile),
              tone: _profileTone(profile),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ProfileScreen()),
              ),
            ),
            _Item(
              icon: Icons.group_outlined,
              title: 'Your groups',
              subtitle: _groupsState(groups?.length),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const GroupsScreen()),
              ),
            ),
            _Item(
              icon: Icons.event_outlined,
              title: 'Events',
              subtitle: 'Competitions, workshops and camps near you.',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const BrowseEventsScreen()),
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
                // The router listens to the auth stream, so signing out is all
                // this has to do — it moves on its own.
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

  /// The one thing worth surfacing from the profile: whether any coach can see
  /// them. Somebody who turned it off months ago will not remember.
  static String _profileState(SeekerProfile? profile) {
    if (profile == null) return 'Not filled in yet.';
    if (!profile.openToOffers) {
      return 'Coaches cannot see you. You can still search and message.';
    }
    if (profile.lookingFor.isEmpty) {
      return 'Say what you are looking for, and coaches can find you.';
    }
    return 'Coaches near you can see what you are looking for.';
  }

  static Color? _profileTone(SeekerProfile? profile) {
    if (profile == null) return A91.warn;
    if (!profile.openToOffers || profile.lookingFor.isEmpty) return A91.warn;
    return A91.teal;
  }

  static String _groupsState(int? count) {
    if (count == null) return 'Neighbours asking for the same thing, together.';
    if (count == 0) return 'None yet. Four families asking together beats one.';
    return count == 1 ? 'One group' : '$count groups';
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
