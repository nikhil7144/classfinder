import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/event.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/states.dart';
import 'event_form_screen.dart';
import 'register_screen.dart';

/// Events a coach runs — /events, /events/new, /events/[id]/edit.
///
/// Upcoming first, because an event that has been and gone is a record and an
/// event next Saturday is a job. Drafts sit with the upcoming ones rather than
/// in a pile of their own: a draft is a thing somebody started and has to
/// finish, not an archive.
class EventsScreen extends ConsumerWidget {
  const EventsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final events = ref.watch(myEventsProvider);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          color: A91.grad1,
          backgroundColor: A91.surface,
          onRefresh: () async {
            ref.invalidate(myEventsProvider);
            await ref.read(myEventsProvider.future);
          },
          child: events.when(
            loading: () => const Loading(),
            error: (error, _) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                SizedBox(height: MediaQuery.sizeOf(context).height * 0.25),
                ErrorState(
                  message: error is ApiException
                      ? error.message
                      : 'Something went wrong loading your events.',
                  onRetry: () => ref.invalidate(myEventsProvider),
                ),
              ],
            ),
            data: (all) {
              final now = DateTime.now();
              final upcoming = all
                  .where((e) => e.startsAt.isAfter(now))
                  .toList()
                ..sort((a, b) => a.startsAt.compareTo(b.startsAt));
              final past = all.where((e) => !e.startsAt.isAfter(now)).toList()
                ..sort((a, b) => b.startsAt.compareTo(a.startsAt));

              return CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  const SliverToBoxAdapter(child: _Header()),
                  if (all.isEmpty)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: EmptyState(
                        title: 'No events yet',
                        body: 'A trial, a competition, a summer camp. Put it '
                            'up and families in your city will see it.',
                      ),
                    )
                  else ...[
                    if (upcoming.isNotEmpty) _section('Coming up', upcoming),
                    if (past.isNotEmpty) _section('Been and gone', past),
                    const SliverToBoxAdapter(child: SizedBox(height: 90)),
                  ],
                ],
              );
            },
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const EventFormScreen()),
        ),
        backgroundColor: A91.grad1,
        foregroundColor: A91.onAccent,
        icon: const Icon(Icons.add),
        label: const Text('New event',
            style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }

  Widget _section(String title, List<Event> events) => SliverMainAxisGroup(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 10),
              child: Text(
                title,
                style: const TextStyle(
                  color: A91.faint,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverList.builder(
              itemCount: events.length,
              itemBuilder: (context, i) => _EventCard(event: events[i]),
            ),
          ),
        ],
      );
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Eyebrow('Events'),
            const SizedBox(height: 10),
            Text(
              'What you are running',
              style: Theme.of(context)
                  .textTheme
                  .headlineLarge
                  ?.copyWith(fontSize: 27),
            ),
          ],
        ),
      );
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event});

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

  @override
  Widget build(BuildContext context) {
    final at = event.startsAt;
    final time = TimeOfDay.fromDateTime(at);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: A91.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: A91.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          InkWell(
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => EventFormScreen(event: event)),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 15, 16, 13),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // The date as a block. A list of events is read by "when"
                  // before it is read by "what".
                  Container(
                    width: 52,
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    decoration: BoxDecoration(
                      color: A91.surface2,
                      borderRadius: BorderRadius.circular(13),
                      border: Border.all(color: A91.borderSoft),
                    ),
                    child: Column(
                      children: [
                        Text(
                          '${at.day}',
                          style: const TextStyle(
                            color: A91.ink,
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                            height: 1.1,
                          ),
                        ),
                        Text(
                          _months[at.month - 1],
                          style: const TextStyle(
                              color: A91.faint,
                              fontSize: 11,
                              fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 13),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          event.title.isEmpty ? 'Untitled event' : event.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: A91.ink,
                            fontSize: 15.5,
                            fontWeight: FontWeight.w700,
                            height: 1.3,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          [
                            '${time.hour.toString().padLeft(2, '0')}:'
                                '${time.minute.toString().padLeft(2, '0')}',
                            if (event.venueName.trim().isNotEmpty)
                              event.venueName.trim(),
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style:
                              const TextStyle(color: A91.faint, fontSize: 12.5),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  _StatusChip(status: event.status),
                ],
              ),
            ),
          ),
          // The register only exists for an event taking entries here. An
          // announcement has nobody to list, and an external one keeps its
          // list on somebody else's site.
          if (event.takesEntriesHere && event.id != null) ...[
            const Divider(height: 1),
            InkWell(
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => RegisterScreen(event: event),
                ),
              ),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    const Icon(Icons.how_to_reg_outlined,
                        size: 17, color: A91.grad2),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        event.entriesCount == 0
                            ? 'Nobody has entered yet'
                            : '${event.entriesCount} '
                                '${event.entriesCount == 1 ? 'entry' : 'entries'}',
                        style: const TextStyle(color: A91.muted, fontSize: 13),
                      ),
                    ),
                    const Text('Register',
                        style: TextStyle(
                            color: A91.grad2,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700)),
                    const Icon(Icons.chevron_right, size: 18, color: A91.faint),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final EventStatus status;

  Color get _tone => switch (status) {
        EventStatus.published => A91.teal,
        EventStatus.draft => A91.warn,
        EventStatus.cancelled => A91.danger,
        EventStatus.completed => A91.faint,
      };

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: _tone.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: _tone.withValues(alpha: 0.32)),
        ),
        child: Text(
          status.label,
          style: TextStyle(
              color: _tone, fontSize: 10.5, fontWeight: FontWeight.w700),
        ),
      );
}
