import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import '../screens/notifications/notifications_screen.dart';
import '../theme/theme.dart';

/// Floating on both shells, not an AppBar action — neither shell has an
/// AppBar (see app.dart's own note on that), so this sits as its own
/// overlay instead of in actions:, the same way the shells already float
/// their bottom NavigationBar over a Stack of tabs rather than wrapping
/// each tab in one.
///
/// The count is [Alerts.needsYou], not a second one computed from the
/// notification list — the README says why: it is already the number a
/// bell should carry, and nothing here owns a definition that could drift
/// from it.
class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final needsYou = ref.watch(alertsProvider).value?.needsYou ?? 0;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.only(top: 6, right: 14),
        child: Align(
          alignment: Alignment.topRight,
          child: Material(
            color: A91.surface,
            shape: const CircleBorder(),
            // Not `const`: A91.surface/border read the theme flag directly.
            // ignore: prefer_const_constructors
            child: Ink(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: A91.border),
              ),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) =>
                        ThemeAware(builder: (_) => const NotificationsScreen()),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(9),
                  child: Badge(
                    isLabelVisible: needsYou > 0,
                    label: Text('$needsYou'),
                    backgroundColor: A91.coral,
                    textColor: A91.onAccent,
                    child: Icon(
                      Icons.notifications_outlined,
                      size: 20,
                      color: A91.muted,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
