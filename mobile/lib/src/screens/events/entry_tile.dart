import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/entry.dart';
import '../../data/models/event.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/primary_button.dart';

/// One entry on the register.
///
/// Collapsed to a line by default — a register is scanned, not read — and
/// opens to the payment controls and the team sheet on a tap.
class EntryTile extends ConsumerStatefulWidget {
  const EntryTile({super.key, required this.entry, required this.event});

  final Entry entry;
  final Event event;

  @override
  ConsumerState<EntryTile> createState() => _EntryTileState();
}

class _EntryTileState extends ConsumerState<EntryTile> {
  bool _open = false;
  bool _busy = false;
  String? _error;

  Entry get _e => widget.entry;

  void _refresh() {
    ref.invalidate(entriesProvider(widget.event.id!));
    // The counts on the event card come from the event, not the register.
    ref.invalidate(myEventsProvider);
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      _refresh();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Taking money is two questions — how much, and how it arrived — so it is a
  /// sheet rather than a button. Waiving is one question and gets its own.
  Future<void> _takePayment() async {
    final reference = TextEditingController();
    var mode = 'cash';

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: A91.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      builder: (context) => StatefulBuilder(
        builder: (context, setSheet) => Padding(
          padding:
              EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Payment from ${_e.participantName}',
                    style: Theme.of(context).textTheme.titleLarge),
                if (_e.amountDue != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    '₹${_e.amountDue!.toStringAsFixed(0)} due',
                    style: const TextStyle(color: A91.faint, fontSize: 13),
                  ),
                ],
                const SizedBox(height: 18),
                const Text('How did it arrive?',
                    style: TextStyle(
                        color: A91.ink,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final entry in paymentModes.entries)
                      _Chip(
                        label: entry.value,
                        selected: mode == entry.key,
                        onTap: () => setSheet(() => mode = entry.key),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: reference,
                  decoration: const InputDecoration(
                    hintText: 'Reference — a UPI id, a slip number',
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 18),
                PrimaryButton(
                  label: 'Mark paid',
                  onPressed: () => Navigator.pop(context, true),
                ),
                const SizedBox(height: 10),
              ],
            ),
          ),
        ),
      ),
    );

    if (confirmed != true) return;

    await _run(() => ref.read(eventsRepositoryProvider).setPayment(
          _e.id,
          status: 'paid',
          mode: mode,
          reference: reference.text,
        ));
  }

  Future<void> _cancel() async {
    final reason = TextEditingController();
    // A paid entry being removed leaves money owed back. Marking that is the
    // whole of what this product does about it — nothing here touches a
    // payment rail, and saying so is better than implying a refund happened.
    var refund = _e.isPaid;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialog) => AlertDialog(
          backgroundColor: A91.surface,
          title: const Text('Remove this entry?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${_e.participantName} comes off the register. The family is '
                'told.',
                style: const TextStyle(color: A91.muted, height: 1.5),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: reason,
                decoration: const InputDecoration(
                  hintText: 'Why, so the family knows',
                  isDense: true,
                ),
              ),
              if (_e.isPaid) ...[
                const SizedBox(height: 10),
                CheckboxListTile(
                  value: refund,
                  onChanged: (v) => setDialog(() => refund = v ?? false),
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  activeColor: A91.grad1,
                  title: const Text(
                    'They are owed a refund',
                    style: TextStyle(color: A91.muted, fontSize: 13),
                  ),
                  subtitle: const Text(
                    'Marks it as owed. It does not move any money.',
                    style: TextStyle(color: A91.faint, fontSize: 11.5),
                  ),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep it', style: TextStyle(color: A91.muted)),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Remove',
                  style: TextStyle(
                      color: A91.danger, fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );

    if (confirmed != true) return;

    await _run(() => ref.read(eventsRepositoryProvider).cancelEntry(
          _e.id,
          reason: reason.text,
          refund: refund,
        ));
  }

  @override
  Widget build(BuildContext context) {
    final age = _e.ageAt(widget.event.startsAt);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: A91.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: A91.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => _open = !_open),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(15, 13, 13, 13),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _e.participantName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: _e.isCancelled ? A91.faint : A91.ink,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            decoration: _e.isCancelled
                                ? TextDecoration.lineThrough
                                : null,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          [
                            if (_e.categoryName != null) _e.categoryName!,
                            if (age != null) '$age yrs',
                            if (_e.isTeam) '${_e.members.length} in the team',
                            _e.receiptNo,
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style:
                              const TextStyle(color: A91.faint, fontSize: 11.5),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  _PaymentChip(entry: _e),
                  Icon(_open ? Icons.expand_less : Icons.expand_more,
                      size: 20, color: A91.faint),
                ],
              ),
            ),
          ),
          if (_open) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(15, 12, 15, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_e.isTeam) ...[
                    const Text('The team',
                        style: TextStyle(
                            color: A91.faint,
                            fontSize: 11,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 7),
                    for (final m in _e.members)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text('· ${m.name}',
                            style: const TextStyle(
                                color: A91.muted, fontSize: 13)),
                      ),
                    const SizedBox(height: 12),
                  ],
                  if (_e.isCancelled)
                    _Note(
                      text: _e.cancelledByMe
                          ? 'You removed this entry.'
                          : 'The family withdrew.',
                      detail: _e.cancelledReason,
                    )
                  else ...[
                    if (_e.paymentMode != null)
                      _Note(
                        text: 'Paid by '
                            '${paymentModes[_e.paymentMode] ?? _e.paymentMode}',
                        detail: _e.paymentReference,
                      ),
                    if (_error != null) ...[
                      const SizedBox(height: 8),
                      Text(_error!,
                          style: const TextStyle(
                              color: A91.danger, fontSize: 12.5)),
                    ],
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (!_e.isPaid) ...[
                          _Action(
                            label: 'Take payment',
                            primary: true,
                            busy: _busy,
                            onTap: _takePayment,
                          ),
                          _Action(
                            label: 'Waive',
                            busy: _busy,
                            onTap: () => _run(
                              () => ref
                                  .read(eventsRepositoryProvider)
                                  .setPayment(_e.id, status: 'waived'),
                            ),
                          ),
                        ] else
                          _Action(
                            label: 'Mark unpaid',
                            busy: _busy,
                            onTap: () => _run(
                              () => ref
                                  .read(eventsRepositoryProvider)
                                  .setPayment(_e.id, status: 'unpaid'),
                            ),
                          ),
                        _Action(
                          label: 'Remove',
                          busy: _busy,
                          onTap: _cancel,
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PaymentChip extends StatelessWidget {
  const _PaymentChip({required this.entry});

  final Entry entry;

  @override
  Widget build(BuildContext context) {
    if (entry.isCancelled) {
      return const _Pill(text: 'Removed', tone: A91.faint);
    }

    final tone = switch (entry.paymentStatus) {
      'paid' || 'waived' => A91.teal,
      'refund_due' => A91.warn,
      'refunded' => A91.faint,
      _ => A91.warn,
    };

    // An unpaid entry says what it owes, because that is the number somebody
    // is about to be handed.
    final text = entry.paymentStatus == 'unpaid' && entry.amountDue != null
        ? '₹${entry.amountDue!.toStringAsFixed(0)}'
        : entry.paymentLabel;

    return _Pill(text: text, tone: tone);
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, required this.tone});

  final String text;
  final Color tone;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(right: 6),
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: tone.withValues(alpha: 0.32)),
        ),
        child: Text(text,
            style: TextStyle(
                color: tone, fontSize: 11, fontWeight: FontWeight.w700)),
      );
}

class _Note extends StatelessWidget {
  const _Note({required this.text, this.detail});

  final String text;
  final String? detail;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(text, style: const TextStyle(color: A91.muted, fontSize: 12.5)),
          if (detail != null && detail!.trim().isNotEmpty)
            Text(detail!.trim(),
                style: const TextStyle(color: A91.faint, fontSize: 12)),
        ],
      );
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: selected ? A91.surface3 : A91.surface2,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: selected ? A91.grad1 : A91.border),
            ),
            child: Text(
              label,
              style: TextStyle(
                color: selected ? A91.ink : A91.muted,
                fontSize: 12.5,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
        ),
      );
}

class _Action extends StatelessWidget {
  const _Action({
    required this.label,
    required this.onTap,
    required this.busy,
    this.primary = false,
  });

  final String label;
  final VoidCallback onTap;
  final bool busy;
  final bool primary;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: busy ? 0.5 : 1,
        child: Material(
          color: primary ? A91.surface3 : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: busy ? null : onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: primary ? A91.grad1 : A91.border),
              ),
              child: Text(
                label,
                style: TextStyle(
                  color: primary ? A91.ink : A91.muted,
                  fontSize: 12.5,
                  fontWeight: primary ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ),
          ),
        ),
      );
}
