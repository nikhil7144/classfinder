import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/entry.dart';
import '../../data/models/event.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/states.dart';
import 'entry_tile.dart';

/// Who has entered one event — /events/[id]/entries.
///
/// The screen a coach actually holds on the day. It is a register first and a
/// report second: the money owed is at the top because that is the question
/// somebody asks twenty times between nine and ten, and the search box is
/// there because calling out a name and finding it in a list is the whole job.
///
/// Every name here belongs to a child. It is the one place in the product that
/// holds one, and it is shown to the organiser running the event and to
/// nobody else.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key, required this.event});

  final Event event;

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _search = TextEditingController();

  /// Null means every category.
  String? _categoryId;
  bool _unpaidOnly = false;

  @override
  void initState() {
    super.initState();
    _search.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<Entry> _filter(List<Entry> all) {
    final q = _search.text.trim().toLowerCase();

    return all.where((e) {
      if (_categoryId != null && e.categoryId != _categoryId) return false;
      // An unpaid filter is about who still owes, so a withdrawal is not it.
      if (_unpaidOnly && (e.isPaid || e.isCancelled)) return false;
      if (q.isEmpty) return true;

      return e.participantName.toLowerCase().contains(q) ||
          e.receiptNo.toLowerCase().contains(q) ||
          e.members.any((m) => m.name.toLowerCase().contains(q));
    }).toList()
      // Cancelled last, then alphabetical: a register is read by name.
      ..sort((a, b) {
        if (a.isCancelled != b.isCancelled) return a.isCancelled ? 1 : -1;
        return a.participantName
            .toLowerCase()
            .compareTo(b.participantName.toLowerCase());
      });
  }

  @override
  Widget build(BuildContext context) {
    final entries = ref.watch(entriesProvider(widget.event.id!));

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Register',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            Text(
              widget.event.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11.5, color: A91.faint),
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: entries.when(
          loading: () => const Loading(),
          error: (error, _) => ErrorState(
            message: error is ApiException
                ? error.message
                : 'Something went wrong loading the register.',
            onRetry: () => ref.invalidate(entriesProvider(widget.event.id!)),
          ),
          data: (all) {
            final shown = _filter(all);

            return RefreshIndicator(
              color: A91.grad1,
              backgroundColor: A91.surface,
              onRefresh: () async {
                ref.invalidate(entriesProvider(widget.event.id!));
                await ref.read(entriesProvider(widget.event.id!).future);
              },
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(child: _Totals(entries: all)),
                  SliverToBoxAdapter(
                    child: _Filters(
                      search: _search,
                      categories: widget.event.categories,
                      categoryId: _categoryId,
                      unpaidOnly: _unpaidOnly,
                      onCategory: (id) => setState(() => _categoryId = id),
                      onUnpaid: (v) => setState(() => _unpaidOnly = v),
                    ),
                  ),
                  if (shown.isEmpty)
                    SliverFillRemaining(
                      hasScrollBody: false,
                      child: EmptyState(
                        title: all.isEmpty
                            ? 'Nobody has entered yet'
                            : 'Nothing matches that',
                        body: all.isEmpty
                            ? 'Entries appear here as families take their '
                                'places.'
                            : 'Try a different name, or clear the filters.',
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
                      sliver: SliverList.builder(
                        itemCount: shown.length,
                        itemBuilder: (context, i) => EntryTile(
                          entry: shown[i],
                          event: widget.event,
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

/// Places taken, and money still owed. The two numbers somebody is asked for.
class _Totals extends StatelessWidget {
  const _Totals({required this.entries});

  final List<Entry> entries;

  @override
  Widget build(BuildContext context) {
    final live = entries.where((e) => !e.isCancelled).toList();
    final unpaid = live.where((e) => !e.isPaid).toList();
    final owed = unpaid.fold<num>(0, (sum, e) => sum + (e.amountDue ?? 0));

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
      child: Row(
        children: [
          _Total(value: '${live.length}', label: 'entered'),
          const SizedBox(width: 24),
          _Total(value: '${unpaid.length}', label: 'unpaid'),
          if (owed > 0) ...[
            const SizedBox(width: 24),
            _Total(
              value: '₹${owed.toStringAsFixed(0)}',
              label: 'owed',
              tone: A91.warn,
            ),
          ],
        ],
      ),
    );
  }
}

class _Total extends StatelessWidget {
  const _Total({required this.value, required this.label, this.tone});

  final String value;
  final String label;
  final Color? tone;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: TextStyle(
              color: tone ?? A91.ink,
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 1),
          Text(label, style: const TextStyle(color: A91.faint, fontSize: 11.5)),
        ],
      );
}

class _Filters extends StatelessWidget {
  const _Filters({
    required this.search,
    required this.categories,
    required this.categoryId,
    required this.unpaidOnly,
    required this.onCategory,
    required this.onUnpaid,
  });

  final TextEditingController search;
  final List<EventCategory> categories;
  final String? categoryId;
  final bool unpaidOnly;
  final ValueChanged<String?> onCategory;
  final ValueChanged<bool> onUnpaid;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
        child: Column(
          children: [
            TextField(
              controller: search,
              decoration: const InputDecoration(
                hintText: 'Find a name or a receipt number',
                isDense: true,
                prefixIcon: Icon(Icons.search, color: A91.faint, size: 20),
              ),
            ),
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _Chip(
                    label: 'Unpaid only',
                    selected: unpaidOnly,
                    onTap: () => onUnpaid(!unpaidOnly),
                  ),
                  if (categories.length > 1) ...[
                    const SizedBox(width: 8),
                    _Chip(
                      label: 'All categories',
                      selected: categoryId == null,
                      onTap: () => onCategory(null),
                    ),
                    for (final c in categories) ...[
                      const SizedBox(width: 8),
                      _Chip(
                        label: c.name,
                        selected: categoryId == c.id,
                        onTap: () => onCategory(c.id),
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ],
        ),
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
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
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
