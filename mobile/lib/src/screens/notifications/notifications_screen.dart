import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/notification.dart';
import '../../providers.dart';
import '../../push.dart';
import '../../theme/theme.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/states.dart';

/// Behind the bell — `GET /api/v1/notifications`, paged.
///
/// Marks everything on the first page read the moment it opens, the way
/// opening an inbox does: the backend suppresses push for a notification
/// already read, so clearing these here is also what stops a buzz about
/// something somebody is already looking at.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  final _items = <AppNotification>[];
  DateTime? _nextBefore;
  bool _loadedOnce = false;
  bool _loadingMore = false;
  String? _error;

  /// Guards against a rapid run of taps stacking one pushed thread screen
  /// per tap — [routeToNotification] awaits a lookup before it pushes
  /// anywhere, so without this a second tap mid-lookup used to fire that
  /// lookup again and land on the same thread twice. Not shown on screen:
  /// the lookup now reads an already-cached inbox (see push.dart), so the
  /// gap this closes is normally too short to need a loader for at all.
  bool _opening = false;

  @override
  void initState() {
    super.initState();
    _loadFirstPage();
  }

  Future<void> _loadFirstPage() async {
    try {
      final page =
          await ref.read(notificationsRepositoryProvider).list(limit: 30);
      if (!mounted) return;
      setState(() {
        _items
          ..clear()
          ..addAll(page.items);
        _nextBefore = page.nextBefore;
        _loadedOnce = true;
      });

      // Read on open, not read-on-tap-only: the badge this screen was
      // reached from should clear once somebody has actually seen the
      // list, the same way opening Messages clears unread threads.
      if (page.items.any((n) => n.unread)) {
        await ref.read(notificationsRepositoryProvider).markRead(all: true);
        ref.invalidate(alertsProvider);
        if (mounted) {
          setState(() {
            for (var i = 0; i < _items.length; i++) {
              final n = _items[i];
              if (n.unread) {
                _items[i] = AppNotification(
                  id: n.id,
                  kind: n.kind,
                  title: n.title,
                  body: n.body,
                  url: n.url,
                  threadKind: n.threadKind,
                  threadId: n.threadId,
                  createdAt: n.createdAt,
                  readAt: DateTime.now(),
                  unread: false,
                );
              }
            }
          });
        }
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = "Couldn't load notifications.");
      }
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _nextBefore == null) return;
    setState(() => _loadingMore = true);
    try {
      final page = await ref
          .read(notificationsRepositoryProvider)
          .list(limit: 30, before: _nextBefore);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _nextBefore = page.nextBefore;
      });
    } catch (_) {
      // A failed "load more" is not worth an error banner — the list
      // already on screen stays exactly as useful.
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _open(AppNotification n) async {
    if (_opening) return;
    _opening = true;
    try {
      if (n.threadId != null) {
        // Fire-and-forget: a read receipt is not worth making the tap wait
        // on a second network round trip before it can navigate.
        ref
            .read(notificationsRepositoryProvider)
            .markRead(threadId: n.threadId)
            .then((_) {
          if (mounted) ref.invalidate(alertsProvider);
        }).catchError((_) {});
      }
      await ref.read(pushServiceProvider).routeToNotification({
        'kind': n.kind,
        'url': n.url ?? '',
        'threadKind': n.threadKind ?? '',
        'threadId': n.threadId ?? '',
      });
    } finally {
      _opening = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: SafeArea(
        child: !_loadedOnce && _error == null
            ? const NotificationsSkeleton()
            : _error != null && _items.isEmpty
                ? ErrorState(message: _error!, onRetry: _loadFirstPage)
                : _items.isEmpty
                    ? const EmptyState(
                        title: 'Nothing yet',
                        body: 'Replies, bookings and the rest will show up '
                            'here as they happen.',
                      )
                    : RefreshIndicator(
                        onRefresh: _loadFirstPage,
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                          itemCount: _items.length + (_nextBefore != null ? 1 : 0),
                          separatorBuilder: (_, __) => const SizedBox(height: 10),
                          itemBuilder: (context, i) {
                            if (i == _items.length) {
                              if (!_loadingMore) {
                                WidgetsBinding.instance
                                    .addPostFrameCallback((_) => _loadMore());
                              }
                              return const Padding(
                                padding: EdgeInsets.symmetric(vertical: 16),
                                child: Center(
                                  child: SizedBox(
                                    height: 18,
                                    width: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  ),
                                ),
                              );
                            }
                            final n = _items[i];
                            return _Row(
                              notification: n,
                              onTap: () => _open(n),
                            );
                          },
                        ),
                      ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.notification, required this.onTap});

  final AppNotification notification;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final n = notification;
    return Material(
      color: A91.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: n.unread ? A91.coral : A91.border,
            ),
            boxShadow: A91.cardShadow,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      n.title,
                      style: TextStyle(
                        color: A91.ink,
                        fontSize: 14.5,
                        fontWeight: n.unread ? FontWeight.w800 : FontWeight.w600,
                      ),
                    ),
                    if (n.body.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        n.body,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: A91.muted, fontSize: 13, height: 1.4),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Text(
                      _when(n.createdAt),
                      style: TextStyle(color: A91.faint, fontSize: 11.5),
                    ),
                  ],
                ),
              ),
              if (n.unread) ...[
                const SizedBox(width: 10),
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  height: 8,
                  width: 8,
                  decoration: BoxDecoration(color: A91.coral, shape: BoxShape.circle),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _when(DateTime at) {
    final diff = DateTime.now().difference(at);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    return '${at.day}/${at.month}/${at.year}';
  }
}
