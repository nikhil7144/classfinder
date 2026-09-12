import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/event.dart';
import '../../data/models/reference.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/states.dart';
import '../listing/fields.dart';
import '../listing/pickers.dart';
import 'event_detail_screen.dart';
import 'my_entries_screen.dart';

/// What is on nearby — /events.
///
/// By city rather than by area: a family will cross a city for a competition
/// in a way they will not cross one for a Tuesday class, so the radius that
/// governs search would be the wrong tool here.
class BrowseEventsScreen extends ConsumerStatefulWidget {
  const BrowseEventsScreen({super.key});

  @override
  ConsumerState<BrowseEventsScreen> createState() => _BrowseEventsScreenState();
}

class _BrowseEventsScreenState extends ConsumerState<BrowseEventsScreen> {
  String? _cityId;
  bool _seeded = false;

  /// Start in the city the family already said they were in.
  void _seed(Reference reference) {
    if (_seeded) return;
    _seeded = true;

    final areaId = ref.read(myProfileProvider).value?.areaId;
    _cityId = reference.area(areaId)?.cityId ??
        (reference.cities.isEmpty ? null : reference.cities.first.id);
  }

  @override
  Widget build(BuildContext context) {
    final reference = ref.watch(referenceProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Events'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const MyEntriesScreen()),
            ),
            child: const Text('Your entries',
                style: TextStyle(color: A91.grad2, fontSize: 13)),
          ),
        ],
      ),
      body: SafeArea(
        child: reference.when(
          loading: () => const ListSkeleton(avatar: false),
          error: (error, _) => ErrorState(
            message: error is ApiException
                ? error.message
                : 'Something went wrong loading the cities.',
            onRetry: () => ref.invalidate(referenceProvider),
          ),
          data: (reference) {
            _seed(reference);
            if (_cityId == null) {
              return const EmptyState(
                title: 'No cities open yet',
                body: 'Once one is, what is on in it shows up here.',
              );
            }

            final events = ref.watch(cityEventsProvider(_cityId!));

            return RefreshIndicator(
              color: A91.grad1,
              backgroundColor: A91.surface,
              onRefresh: () async {
                ref.invalidate(cityEventsProvider(_cityId!));
                await ref.read(cityEventsProvider(_cityId!).future);
              },
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(child: _cityPicker(reference)),
                  ...events.when(
                    loading: () => [
                      const SliverToBoxAdapter(
                          child: ListSkeleton(avatar: false)),
                    ],
                    error: (error, _) => [
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: ErrorState(
                          message: error is ApiException
                              ? error.message
                              : 'Something went wrong loading events.',
                          onRetry: () =>
                              ref.invalidate(cityEventsProvider(_cityId!)),
                        ),
                      ),
                    ],
                    data: (events) => [
                      if (events.isEmpty)
                        const SliverFillRemaining(
                          hasScrollBody: false,
                          child: EmptyState(
                            title: 'Nothing on just yet',
                            body: 'Competitions, workshops and camps show up '
                                'here as coaches and organisers put them on.',
                          ),
                        )
                      else
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
                          sliver: SliverList.builder(
                            itemCount: events.length,
                            itemBuilder: (context, i) =>
                                EventCard(event: events[i]),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _cityPicker(Reference reference) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 2),
        child: Field(
          label: 'Where',
          child: PickerField(
            value: reference.city(_cityId)?.name,
            placeholder: 'Choose a city',
            onTap: () async {
              final picked = await pickOne(
                context,
                title: 'Which city',
                selected: _cityId,
                options: [
                  for (final c in reference.cities)
                    PickOption(id: c.id, label: c.name, sublabel: c.state),
                ],
              );
              if (picked == null) return;
              setState(() => _cityId = picked);
            },
          ),
        ),
      );
}

/// One event in a list. Shared by browse and by an entry's own card, so the
/// same event reads the same wherever it turns up.
class EventCard extends StatelessWidget {
  const EventCard({super.key, required this.event, this.onTap});

  final Event event;
  final VoidCallback? onTap;

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
    final at = event.startsAt.toLocal();
    final time = TimeOfDay.fromDateTime(at);

    // The cheapest way in, which is what a parent scans for.
    final fees = event.categories
        .map((c) => int.tryParse(c.feeAmount))
        .whereType<int>()
        .toList()
      ..sort();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: A91.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: A91.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap ??
            () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => EventDetailScreen(eventId: event.id!),
                  ),
                ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 15, 16, 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
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
                      event.title,
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
                      style: const TextStyle(color: A91.faint, fontSize: 12.5),
                    ),
                    if (fees.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        fees.first == 0
                            ? 'Free to enter'
                            : 'From ₹${fees.first}',
                        style: const TextStyle(
                            color: A91.muted,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600),
                      ),
                    ],
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
