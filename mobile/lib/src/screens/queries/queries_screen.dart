import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/query.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/states.dart';
import 'query_card.dart';

/// Parents who want a call — /dashboard/queries.
///
/// The worklist a chat thread could never be. A coach with twenty enquiries
/// had twenty conversations and no way to record which they had rung, which
/// wanted calling back on Tuesday, and which went nowhere.
///
/// It sits before Messages in the bar on purpose, and the web says why: a
/// parent who left a number is waiting on a call, not on a reply, and that is
/// the more perishable of the two.
class QueriesScreen extends ConsumerStatefulWidget {
  const QueriesScreen({super.key});

  @override
  ConsumerState<QueriesScreen> createState() => _QueriesScreenState();
}

class _QueriesScreenState extends ConsumerState<QueriesScreen> {
  bool _showFinished = false;

  /// Marked read once per visit, not per build.
  final _read = <String>{};

  /// Opening the tab is reading what is on it.
  ///
  /// Failure is swallowed: the leads are on screen either way, and an error
  /// about a read receipt is noise about something nobody asked for.
  Future<void> _markRead(List<Query> queries) async {
    final unread =
        queries.where((q) => q.unread && !_read.contains(q.id)).toList();
    if (unread.isEmpty) return;

    _read.addAll(unread.map((q) => q.id));
    final repository = ref.read(queriesRepositoryProvider);

    for (final q in unread) {
      try {
        await repository.markRead(q.id);
      } on ApiException {
        // Ignored.
      }
    }
    if (!mounted) return;
    // The badge on the tab comes from alerts, not from this list.
    ref.invalidate(alertsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final queries = ref.watch(queriesProvider);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          color: A91.grad1,
          backgroundColor: A91.surface,
          onRefresh: () async {
            ref.invalidate(alertsProvider);
            ref.invalidate(queriesProvider);
            await ref.read(queriesProvider.future);
          },
          child: queries.when(
            loading: () => const ListSkeleton(),
            error: (error, _) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                SizedBox(height: MediaQuery.sizeOf(context).height * 0.25),
                ErrorState(
                  message: error is ApiException
                      ? error.message
                      : 'Something went wrong loading your queries.',
                  onRetry: () => ref.invalidate(queriesProvider),
                ),
              ],
            ),
            data: (all) {
              // Fired here rather than in the provider: a provider that writes
              // on every rebuild is the wrong place for it, and this is the
              // moment they are actually on screen.
              WidgetsBinding.instance
                  .addPostFrameCallback((_) => _markRead(all));

              final open = all.where((q) => q.status.isOpen).toList();
              final finished = all.where((q) => !q.status.isOpen).toList();
              final shown = _showFinished ? finished : open;

              return CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(
                    child: _Header(
                      open: open.length,
                      finished: finished.length,
                      showFinished: _showFinished,
                      onSwitch: (v) => setState(() => _showFinished = v),
                    ),
                  ),
                  if (shown.isEmpty)
                    SliverFillRemaining(
                      hasScrollBody: false,
                      child: EmptyState(
                        title: _showFinished
                            ? 'Nothing finished yet'
                            : 'Nobody is waiting on a call',
                        body: _showFinished
                            ? 'Leads you have completed or closed will be here.'
                            : 'When a parent asks you to ring them, it lands '
                                'here with their number.',
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
                      sliver: SliverList.builder(
                        itemCount: shown.length,
                        itemBuilder: (context, i) => QueryCard(query: shown[i]),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.open,
    required this.finished,
    required this.showFinished,
    required this.onSwitch,
  });

  final int open;
  final int finished;
  final bool showFinished;
  final ValueChanged<bool> onSwitch;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Eyebrow('Queries'),
            const SizedBox(height: 10),
            Text(
              'Parents who want a call',
              style: Theme.of(context)
                  .textTheme
                  .headlineLarge
                  ?.copyWith(fontSize: 27),
            ),
            const SizedBox(height: 8),
            const Text(
              'They gave a number rather than starting a conversation. Ring '
              'them, book a time, or write instead.',
              style: TextStyle(color: A91.faint, fontSize: 13, height: 1.5),
            ),
            // The switch only appears once there is a second pile to switch to.
            if (finished > 0) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  _Pill(
                    label: 'Open ($open)',
                    selected: !showFinished,
                    onTap: () => onSwitch(false),
                  ),
                  const SizedBox(width: 8),
                  _Pill(
                    label: 'Finished ($finished)',
                    selected: showFinished,
                    onTap: () => onSwitch(true),
                  ),
                ],
              ),
            ],
          ],
        ),
      );
}

class _Pill extends StatelessWidget {
  const _Pill({
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
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
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
