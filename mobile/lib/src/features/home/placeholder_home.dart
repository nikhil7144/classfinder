import 'package:flutter/material.dart';

import '../../flavor.dart';
import '../../theme/theme.dart';

/// A scaffold that proves the build, the flavor and the theme are wired.
///
/// Deliberately the only screen. The real ones are blocked on the API
/// migrations in MOBILE-PLAN.md §3 — building them against the SQL functions
/// the web still calls would make this the second client reading the schema
/// directly, which §2 explains is the one thing not to do.
class PlaceholderHome extends StatelessWidget {
  const PlaceholderHome({super.key});

  @override
  Widget build(BuildContext context) {
    final next = appFlavor.isSeeker
        ? const [
            ('M1', 'Search — search_providers'),
            ('M2', 'Coach profile — get_provider_profile'),
            ('M3', 'Spaces — space_feed, set_reaction'),
            ('M4', 'Chat — my_threads, mark_thread_read'),
          ]
        : const [
            ('M5', 'Demand feed — students_for_provider'),
            ('M4', 'Chat — my_threads, mark_thread_read'),
            ('M3', 'My Space — space_feed, posting'),
            ('M2', 'My listing — get_provider_profile'),
          ];

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('SCAFFOLD', style: A91.eyebrow()),
              const SizedBox(height: 12),
              Text(
                appFlavor.appName,
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 12),
              Text(
                'The build works, the flavor is ${appFlavor.name}, and the '
                'palette is the one from globals.css. No product screens yet.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 28),
              Text('BLOCKED ON', style: A91.eyebrow()),
              const SizedBox(height: 12),
              ...next.map(
                (row) => Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    leading: Text(
                      row.$1,
                      style: A91.eyebrow().copyWith(color: A91.faint),
                    ),
                    title: Text(
                      row.$2,
                      style: const TextStyle(
                        color: A91.ink,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ),
              ),
              const Spacer(),
              Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  gradient: A91.ctaGradient,
                  borderRadius: BorderRadius.circular(999),
                ),
                padding: const EdgeInsets.symmetric(vertical: 15),
                child: const Center(
                  child: Text(
                    'Primary action',
                    style: TextStyle(
                      color: A91.onAccent,
                      fontWeight: FontWeight.w700,
                      fontSize: 14.5,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
