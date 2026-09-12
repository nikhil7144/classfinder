import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/space.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/states.dart';
import '../space/post_card.dart';

/// Someone else's Space, as a family reads it.
///
/// The coach's own version of this is `screens/space/` — same posts, different
/// job. Here there is a Follow button and no composer, and `canManage` is
/// false so nothing offers to delete a post that is not yours.
class CoachSpaceTab extends ConsumerWidget {
  const CoachSpaceTab({super.key, required this.providerId});

  final String providerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final space = ref.watch(spaceProvider(providerId));
    final posts = ref.watch(spacePostsProvider(providerId));

    return space.when(
      loading: () => const Loading(),
      error: (error, _) => ErrorState(
        message: error is ApiException
            ? error.message
            : 'Something went wrong loading this Space.',
        onRetry: () {
          ref.invalidate(spaceProvider(providerId));
          ref.invalidate(spacePostsProvider(providerId));
        },
      ),
      data: (space) => RefreshIndicator(
        color: A91.grad1,
        backgroundColor: A91.surface,
        onRefresh: () async {
          ref.invalidate(spaceProvider(providerId));
          ref.invalidate(spacePostsProvider(providerId));
          await ref.read(spacePostsProvider(providerId).future);
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: _Header(space: space, providerId: providerId),
            ),
            ...posts.when(
              loading: () => [
                const SliverFillRemaining(
                    hasScrollBody: false, child: Loading()),
              ],
              error: (error, _) => [
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: ErrorState(
                    message: error is ApiException
                        ? error.message
                        : 'Something went wrong loading the posts.',
                    onRetry: () =>
                        ref.invalidate(spacePostsProvider(providerId)),
                  ),
                ),
              ],
              data: (posts) => [
                if (posts.isEmpty)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: EmptyState(
                      title: 'Nothing here yet',
                      body: 'When they post photos or videos of their classes, '
                          'it shows up here.',
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
                    sliver: SliverList.builder(
                      itemCount: posts.length,
                      itemBuilder: (context, i) => PostCard(post: posts[i]),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends ConsumerStatefulWidget {
  const _Header({required this.space, required this.providerId});

  final Space space;
  final String providerId;

  @override
  ConsumerState<_Header> createState() => _HeaderState();
}

class _HeaderState extends ConsumerState<_Header> {
  bool _busy = false;

  /// What this device believes, so the tap lands before the round trip does.
  bool? _following;

  bool get _isFollowing => _following ?? widget.space.iFollow;

  Future<void> _toggle() async {
    final next = !_isFollowing;
    setState(() {
      _following = next;
      _busy = true;
    });

    try {
      await ref
          .read(spacesRepositoryProvider)
          .setFollowing(widget.providerId, next);
      ref.invalidate(spaceProvider(widget.providerId));
      // The list of Spaces a parent follows is a different read.
      ref.invalidate(followedSpacesProvider);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _following = !next);
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
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (widget.space.headline != null)
                    Text(
                      widget.space.headline!,
                      style: const TextStyle(
                          color: A91.ink,
                          fontSize: 15,
                          fontWeight: FontWeight.w700),
                    ),
                  const SizedBox(height: 4),
                  Text(
                    '${widget.space.postCount} '
                    '${widget.space.postCount == 1 ? 'post' : 'posts'}'
                    '  ·  ${widget.space.followerCount} '
                    '${widget.space.followerCount == 1 ? 'follower' : 'followers'}',
                    style: const TextStyle(color: A91.faint, fontSize: 12.5),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Opacity(
              opacity: _busy ? 0.55 : 1,
              child: Material(
                color: _isFollowing ? A91.surface3 : Colors.transparent,
                borderRadius: BorderRadius.circular(999),
                child: InkWell(
                  borderRadius: BorderRadius.circular(999),
                  onTap: _busy ? null : _toggle,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                          color: _isFollowing ? A91.border : A91.grad1),
                    ),
                    child: Text(
                      _isFollowing ? 'Following' : 'Follow',
                      style: TextStyle(
                        color: _isFollowing ? A91.muted : A91.accentInk,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
}
