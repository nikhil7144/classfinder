import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../data/api_exception.dart';
import '../../data/entry_rules.dart';
import '../../data/models/event.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/states.dart';
import 'enter_screen.dart';

/// One event — /events/[id].
///
/// What it is, where, and what a family can actually enter. The categories are
/// the point: most competitions carry an under-10 singles and an under-14 team
/// at different fees, and "enter" without saying which is not an action.
class EventDetailScreen extends ConsumerWidget {
  const EventDetailScreen({super.key, required this.eventId});

  final String eventId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final event = ref.watch(eventProvider(eventId));

    return Scaffold(
      appBar: AppBar(title: Text(event.value?.title ?? 'Event')),
      body: SafeArea(
        child: event.when(
          loading: () => const DetailSkeleton(),
          error: (error, _) => ErrorState(
            message: error is ApiException
                ? error.message
                : 'Something went wrong loading this event.',
            onRetry: () => ref.invalidate(eventProvider(eventId)),
          ),
          data: (event) => _Body(event: event),
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.event});

  final Event event;

  static const _months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  static const _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  static String _moment(DateTime at) {
    final local = at.toLocal();
    final time = TimeOfDay.fromDateTime(local);
    return '${_days[local.weekday - 1]} ${local.day} '
        '${_months[local.month - 1]}, '
        '${time.hour.toString().padLeft(2, '0')}:'
        '${time.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final closed = event.bookingClosesAt != null &&
        event.bookingClosesAt!.isBefore(DateTime.now());
    final notOpenYet = event.bookingOpensAt != null &&
        event.bookingOpensAt!.isAfter(DateTime.now());

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
      children: [
        Text(event.title,
            style: Theme.of(context)
                .textTheme
                .headlineLarge
                ?.copyWith(fontSize: 25)),
        const SizedBox(height: 14),
        _Fact(icon: Icons.event_outlined, text: _moment(event.startsAt)),
        if (event.endsAt != null)
          _Fact(
            icon: Icons.schedule_outlined,
            text: 'Until ${_moment(event.endsAt!)}',
          ),
        if (event.venueName.trim().isNotEmpty)
          _Fact(icon: Icons.place_outlined, text: event.venueName.trim()),
        if (event.venueAddress.trim().isNotEmpty)
          _Fact(
            icon: Icons.map_outlined,
            text: event.venueAddress.trim(),
            faint: true,
          ),
        if (event.ownerName != null)
          _Fact(
            icon: Icons.person_outline,
            text: 'Run by ${event.ownerName}',
            faint: true,
          ),
        if (event.about.trim().isNotEmpty) ...[
          const SizedBox(height: 22),
          const Eyebrow('About it'),
          const SizedBox(height: 10),
          Text(
            event.about.trim(),
            style: const TextStyle(color: A91.muted, height: 1.6),
          ),
        ],
        const SizedBox(height: 26),
        if (event.status == EventStatus.cancelled)
          const _Notice(
            tone: A91.danger,
            text: 'This event has been cancelled.',
          )
        else if (event.bookingMode == 'none')
          const _Notice(
            tone: A91.faint,
            text: 'This one is an announcement — there is nothing to enter '
                'here. Ask the organiser how to take part.',
          )
        else if (event.bookingMode == 'external')
          _External(url: event.externalBookingUrl)
        else if (notOpenYet)
          _Notice(
            tone: A91.warn,
            text: 'Entries open ${_moment(event.bookingOpensAt!)}.',
          )
        else if (closed)
          const _Notice(
            tone: A91.faint,
            text: 'Entries have closed for this one.',
          )
        else
          _Categories(event: event),
      ],
    );
  }
}

/// What a family can enter, and what each costs.
class _Categories extends StatelessWidget {
  const _Categories({required this.event});

  final Event event;

  @override
  Widget build(BuildContext context) {
    if (event.categories.isEmpty) {
      return const _Notice(
        tone: A91.faint,
        text: 'The organiser has not set up what can be entered yet.',
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('What you can enter',
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        for (final category in event.categories)
          _CategoryCard(event: event, category: category),
        const SizedBox(height: 14),
        const Text(
          'Fees are paid to the organiser. Nothing is charged here.',
          style: TextStyle(color: A91.faint, fontSize: 12, height: 1.5),
        ),
      ],
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({required this.event, required this.category});

  final Event event;
  final EventCategory category;

  @override
  Widget build(BuildContext context) {
    final fee = int.tryParse(category.feeAmount);
    final capacity = int.tryParse(category.capacity ?? '');
    final full = category.isFull;

    final ages = formatAges(category.minAge, category.maxAge);

    final limits = [
      if (category.isTeam && category.teamSize != null)
        'Team of ${category.teamSize}',
      if (ages != null) ages,
      if (capacity != null)
        formatCapacity(category.capacity ?? '', category.entriesCount),
    ].join(' · ');

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: A91.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: A91.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: full
            ? null
            : () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) =>
                        EnterScreen(event: event, category: category),
                  ),
                ),
        child: Opacity(
          opacity: full ? 0.55 : 1,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        category.name,
                        style: const TextStyle(
                          color: A91.ink,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (limits.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(limits,
                            style: const TextStyle(
                                color: A91.faint, fontSize: 12.5)),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  fee == null || fee == 0 ? 'Free' : '₹$fee',
                  style: const TextStyle(
                    color: A91.ink,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (!full) ...[
                  const SizedBox(width: 6),
                  const Icon(Icons.chevron_right, size: 20, color: A91.faint),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Entries are taken somewhere else.
class _External extends StatelessWidget {
  const _External({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _Notice(
            tone: A91.faint,
            text: 'The organiser takes entries on their own site.',
          ),
          if (url.trim().isNotEmpty) ...[
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () async {
                  final uri = Uri.tryParse(url.trim());
                  if (uri != null) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  }
                },
                icon: const Icon(Icons.open_in_new, size: 17, color: A91.grad2),
                label: const Text(
                  'Open their booking page',
                  style:
                      TextStyle(color: A91.grad2, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ],
        ],
      );
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.text, this.faint = false});

  final IconData icon;
  final String text;
  final bool faint;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 9),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 16, color: A91.faint),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                text,
                style: TextStyle(
                  color: faint ? A91.faint : A91.muted,
                  fontSize: 13.5,
                  height: 1.45,
                ),
              ),
            ),
          ],
        ),
      );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.tone, required this.text});

  final Color tone;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: tone.withValues(alpha: 0.3)),
        ),
        child: Text(text,
            style: TextStyle(color: tone, fontSize: 13, height: 1.5)),
      );
}
