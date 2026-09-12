import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/entry.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/states.dart';

/// Entries this family has made — /account/entries.
///
/// Upcoming first, because a place next Saturday is a thing to turn up to and
/// one last month is a record. Withdrawing is here rather than on the event,
/// since this is where somebody goes when they cannot make it.
class MyEntriesScreen extends ConsumerWidget {
  const MyEntriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = ref.watch(myEntriesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Your entries')),
      body: SafeArea(
        child: RefreshIndicator(
          color: A91.grad1,
          backgroundColor: A91.surface,
          onRefresh: () async {
            ref.invalidate(myEntriesProvider);
            await ref.read(myEntriesProvider.future);
          },
          child: entries.when(
            loading: () => const ListSkeleton(avatar: false),
            error: (error, _) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                SizedBox(height: MediaQuery.sizeOf(context).height * 0.2),
                ErrorState(
                  message: error is ApiException
                      ? error.message
                      : 'Something went wrong loading your entries.',
                  onRetry: () => ref.invalidate(myEntriesProvider),
                ),
              ],
            ),
            data: (entries) {
              if (entries.isEmpty) {
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    SizedBox(height: MediaQuery.sizeOf(context).height * 0.18),
                    const EmptyState(
                      title: 'Nothing entered yet',
                      body: 'Competitions, workshops and camps you enter show '
                          'up here, with what you owe and who to ask.',
                    ),
                  ],
                );
              }

              final now = DateTime.now();
              final upcoming = entries
                  .where((e) =>
                      !e.isCancelled && (e.eventStartsAt?.isAfter(now) ?? true))
                  .toList()
                ..sort((a, b) =>
                    (a.eventStartsAt ?? now).compareTo(b.eventStartsAt ?? now));
              final past = entries.where((e) => !upcoming.contains(e)).toList()
                ..sort((a, b) =>
                    (b.eventStartsAt ?? now).compareTo(a.eventStartsAt ?? now));

              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
                children: [
                  if (upcoming.isNotEmpty) ...[
                    const _SectionLabel('Coming up'),
                    for (final e in upcoming) _EntryCard(entry: e),
                  ],
                  if (past.isNotEmpty) ...[
                    const _SectionLabel('Been and gone'),
                    for (final e in past) _EntryCard(entry: e),
                  ],
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 6, 4, 10),
        child: Text(
          text,
          style: const TextStyle(
              color: A91.faint, fontSize: 12.5, fontWeight: FontWeight.w700),
        ),
      );
}

class _EntryCard extends ConsumerStatefulWidget {
  const _EntryCard({required this.entry});

  final Entry entry;

  @override
  ConsumerState<_EntryCard> createState() => _EntryCardState();
}

class _EntryCardState extends ConsumerState<_EntryCard> {
  bool _busy = false;

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

  Future<void> _withdraw() async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: A91.surface,
        title: const Text('Withdraw this entry?'),
        content: Text(
          '${widget.entry.participantName} comes off the list. The organiser '
          'is told. If you have already paid, ask them about the fee — '
          'nothing is refunded here.',
          style: const TextStyle(color: A91.muted, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep it', style: TextStyle(color: A91.muted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Withdraw',
                style:
                    TextStyle(color: A91.danger, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (sure != true) return;

    setState(() => _busy = true);
    try {
      await ref
          .read(eventsRepositoryProvider)
          .cancelEntry(widget.entry.id, reason: 'Withdrawn by the family');
      ref.invalidate(myEntriesProvider);
    } on ApiException catch (e) {
      if (!mounted) return;
      // The deadline is the usual refusal here, and the service says so in
      // words worth showing.
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: A91.surface3,
          content: Text(e.message, style: const TextStyle(color: A91.ink)),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.entry;
    final at = e.eventStartsAt?.toLocal();
    final gone = at != null && at.isBefore(DateTime.now());

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: A91.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: A91.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      e.eventTitle ?? 'An event',
                      style: TextStyle(
                        color: e.isCancelled ? A91.faint : A91.ink,
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                        decoration:
                            e.isCancelled ? TextDecoration.lineThrough : null,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [
                        if (at != null)
                          '${at.day} ${_months[at.month - 1]} ${at.year}',
                        if (e.categoryName != null) e.categoryName!,
                      ].join(' · '),
                      style: const TextStyle(color: A91.faint, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              _StatusPill(entry: e),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.person_outline, size: 15, color: A91.faint),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  e.isTeam
                      ? '${e.participantName} and ${e.members.length} more'
                      : e.participantName,
                  style: const TextStyle(color: A91.muted, fontSize: 13),
                ),
              ),
              Text(
                e.receiptNo,
                style: const TextStyle(
                    color: A91.faint, fontSize: 11.5, letterSpacing: 0.4),
              ),
            ],
          ),
          if (e.isCancelled) ...[
            const SizedBox(height: 10),
            Text(
              e.cancelledByMe
                  ? 'You withdrew this one.'
                  : 'The organiser removed this entry.'
                      '${e.cancelledReason != null ? ' ${e.cancelledReason}' : ''}',
              style: const TextStyle(color: A91.faint, fontSize: 12.5),
            ),
          ] else if (!gone) ...[
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: Opacity(
                opacity: _busy ? 0.5 : 1,
                child: GestureDetector(
                  onTap: _busy ? null : _withdraw,
                  child: const Text(
                    'Withdraw',
                    style: TextStyle(
                        color: A91.faint,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// What is owed, or what happened. The number a family is asked for at the
/// gate is the one worth showing.
class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.entry});

  final Entry entry;

  @override
  Widget build(BuildContext context) {
    final (text, tone) = entry.isCancelled
        ? ('Withdrawn', A91.faint)
        : switch (entry.paymentStatus) {
            'paid' => ('Paid', A91.teal),
            'waived' => ('No fee', A91.teal),
            'refund_due' => ('Refund due', A91.warn),
            'refunded' => ('Refunded', A91.faint),
            _ => (
                entry.amountDue == null || entry.amountDue == 0
                    ? 'Free'
                    : '₹${entry.amountDue!.toStringAsFixed(0)} to pay',
                A91.warn
              ),
          };

    return Container(
      margin: const EdgeInsets.only(left: 8),
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: tone.withValues(alpha: 0.32)),
      ),
      child: Text(
        text,
        style:
            TextStyle(color: tone, fontSize: 10.5, fontWeight: FontWeight.w700),
      ),
    );
  }
}
