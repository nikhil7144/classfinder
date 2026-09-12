import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/api_exception.dart';
import '../../data/models/thread.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/states.dart';

/// Every conversation, both kinds in one list.
///
/// A group pitch and a direct enquiry are different rows underneath and the
/// same thing to read, so they are not separated into tabs. The service has
/// already resolved title, subtitle and unread for whoever is asking.
class ThreadsScreen extends ConsumerWidget {
  const ThreadsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inbox = ref.watch(inboxProvider);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          color: A91.grad1,
          backgroundColor: A91.surface,
          onRefresh: () async {
            ref.invalidate(alertsProvider);
            ref.invalidate(inboxProvider);
            await ref.read(inboxProvider.future);
          },
          child: inbox.when(
            loading: () => const ListSkeleton(),
            error: (error, _) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                SizedBox(height: MediaQuery.sizeOf(context).height * 0.25),
                ErrorState(
                  message: error is ApiException
                      ? error.message
                      : 'Something went wrong loading your messages.',
                  onRetry: () => ref.invalidate(inboxProvider),
                ),
              ],
            ),
            data: (threads) {
              // Newest activity first. The service returns them grouped by
              // kind, and a reader does not think in kinds.
              final sorted = [...threads]
                ..sort((a, b) => b.lastActivity.compareTo(a.lastActivity));

              return CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  const SliverToBoxAdapter(child: _Header()),
                  if (sorted.isEmpty)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: EmptyState(
                        title: 'No conversations yet',
                        body:
                            'When you write to a family, or one writes to you, '
                            'it will be here.',
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                      sliver: SliverList.builder(
                        itemCount: sorted.length,
                        itemBuilder: (context, i) =>
                            _ThreadTile(thread: sorted[i]),
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
  const _Header();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Eyebrow('Messages'),
            const SizedBox(height: 10),
            Text(
              'Your conversations',
              style: Theme.of(context)
                  .textTheme
                  .headlineLarge
                  ?.copyWith(fontSize: 27),
            ),
          ],
        ),
      );
}

class _ThreadTile extends StatelessWidget {
  const _ThreadTile({required this.thread});

  final Thread thread;

  /// "3m", "2h", "Tue", "4 Sep" — a chat list wants the shortest thing that
  /// still answers "when".
  String _when(DateTime at) {
    final diff = DateTime.now().difference(at);
    if (diff.inMinutes < 1) return 'now';
    if (diff.inHours < 1) return '${diff.inMinutes}m';
    if (diff.inDays < 1) return '${diff.inHours}h';
    if (diff.inDays < 7) {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      return days[at.weekday - 1];
    }
    const months = [
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
    return '${at.day} ${months[at.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    // The opening message stands in until somebody replies: a thread with no
    // messages is a pitch nobody has answered, and showing nothing would read
    // as an empty conversation rather than one waiting.
    final preview = thread.lastMessage ?? thread.opening ?? '';

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => context.push('/thread', extra: thread),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Avatar(thread: thread),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            thread.title ?? 'Conversation',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: A91.ink,
                              fontSize: 15,
                              fontWeight: thread.unread
                                  ? FontWeight.w800
                                  : FontWeight.w600,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _when(thread.lastActivity),
                          style:
                              const TextStyle(color: A91.faint, fontSize: 11.5),
                        ),
                      ],
                    ),
                    if (thread.subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        thread.subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:
                            const TextStyle(color: A91.faint, fontSize: 12.5),
                      ),
                    ],
                    if (preview.isNotEmpty) ...[
                      const SizedBox(height: 7),
                      Text(
                        preview,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: thread.unread ? A91.ink : A91.muted,
                          fontSize: 13.5,
                          height: 1.4,
                        ),
                      ),
                    ],
                    if (thread.awaitingReply) ...[
                      const SizedBox(height: 9),
                      const Text(
                        'Waiting on them',
                        style: TextStyle(
                          color: A91.warn,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (thread.unread) ...[
                const SizedBox(width: 10),
                Container(
                  margin: const EdgeInsets.only(top: 6),
                  height: 8,
                  width: 8,
                  decoration: const BoxDecoration(
                    color: A91.grad1,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.thread});

  final Thread thread;

  @override
  Widget build(BuildContext context) {
    final letter = (thread.title ?? '?').characters.firstOrNull ?? '?';

    return Container(
      height: 42,
      width: 42,
      decoration: BoxDecoration(
        color: A91.surface2,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: A91.border),
        image: thread.photoUrl == null
            ? null
            : DecorationImage(
                image: NetworkImage(thread.photoUrl!),
                fit: BoxFit.cover,
              ),
      ),
      alignment: Alignment.center,
      child: thread.photoUrl != null
          ? null
          : Text(
              letter.toUpperCase(),
              style: const TextStyle(
                color: A91.faint,
                fontWeight: FontWeight.w700,
                fontSize: 16,
              ),
            ),
    );
  }
}
