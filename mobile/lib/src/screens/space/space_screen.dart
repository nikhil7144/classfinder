import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/space.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/states.dart';
import 'composer_screen.dart';
import 'post_card.dart';

/// The coach's own Space — /dashboard/space.
///
/// A listing says what somebody offers; this is where a parent sees how they
/// teach. It is the one surface where mobile is plainly better than the web:
/// the photo of the session that just finished is already on the phone.
class SpaceScreen extends ConsumerWidget {
  const SpaceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final space = ref.watch(mySpaceProvider);
    final posts = ref.watch(mySpacePostsProvider);

    return Scaffold(
      body: SafeArea(
        child: space.when(
          loading: () => const ListSkeleton(avatar: false),
          error: (error, _) => ErrorState(
            message: error is ApiException
                ? error.message
                : 'Something went wrong loading your Space.',
            onRetry: () {
              ref.invalidate(mySpaceProvider);
              ref.invalidate(mySpacePostsProvider);
            },
          ),
          data: (space) {
            // No listing yet means no Space. The listing tab is where that
            // starts, and saying so beats an empty page with no way out.
            if (space == null) return const _NoListingYet();

            return RefreshIndicator(
              color: A91.grad1,
              backgroundColor: A91.surface,
              onRefresh: () async {
                ref.invalidate(mySpaceProvider);
                ref.invalidate(mySpacePostsProvider);
                await ref.read(mySpacePostsProvider.future);
              },
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(child: _Header(space: space)),
                  if (space.isSuspended)
                    SliverToBoxAdapter(child: _Suspended(space: space)),
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
                              : 'Something went wrong loading your posts.',
                          onRetry: () => ref.invalidate(mySpacePostsProvider),
                        ),
                      ),
                    ],
                    data: (posts) => [
                      if (posts.isEmpty)
                        const SliverFillRemaining(
                          hasScrollBody: false,
                          child: EmptyState(
                            title: 'Nothing posted yet',
                            body: 'Drills, technique, what a session looks '
                                'like, what your students have won. Parents '
                                'read this while they decide.',
                          ),
                        )
                      else
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 90),
                          sliver: SliverList.builder(
                            itemCount: posts.length,
                            itemBuilder: (context, i) =>
                                PostCard(post: posts[i], canManage: true),
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
      floatingActionButton: space.value == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ComposerScreen(space: space.value!),
                ),
              ),
              backgroundColor: A91.grad1,
              foregroundColor: A91.onAccent,
              icon: const Icon(Icons.add),
              label: const Text('Post',
                  style: TextStyle(fontWeight: FontWeight.w700)),
            ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.space});

  final Space space;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Eyebrow('My Space'),
            const SizedBox(height: 10),
            Text(
              'Show parents what you do',
              style: Theme.of(context)
                  .textTheme
                  .headlineLarge
                  ?.copyWith(fontSize: 27),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                _Stat(
                  value: space.postCount,
                  label: space.postCount == 1 ? 'post' : 'posts',
                ),
                const SizedBox(width: 26),
                _Stat(
                  value: space.followerCount,
                  label: space.followerCount == 1 ? 'follower' : 'followers',
                ),
              ],
            ),
          ],
        ),
      );
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});

  final int value;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Text(
            '$value',
            style: const TextStyle(
              color: A91.ink,
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(color: A91.faint, fontSize: 13)),
        ],
      );
}

/// Taken down. Only the owner is told why, which is why the reason is here at
/// all — the service returns null for it to everybody else.
class _Suspended extends StatelessWidget {
  const _Suspended({required this.space});

  final Space space;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: A91.dangerSoft,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: A91.danger.withValues(alpha: 0.34)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Your Space is hidden',
              style: TextStyle(
                  color: A91.danger,
                  fontWeight: FontWeight.w700,
                  fontSize: 14.5),
            ),
            const SizedBox(height: 5),
            Text(
              space.suspendedReason ??
                  'Families cannot see it at the moment. Write to '
                      'support@aspire91.com and we will go through it with you.',
              style:
                  const TextStyle(color: A91.muted, fontSize: 13, height: 1.5),
            ),
          ],
        ),
      );
}

class _NoListingYet extends StatelessWidget {
  const _NoListingYet();

  @override
  Widget build(BuildContext context) => const EmptyState(
        title: 'Your Space opens with your listing',
        body: 'Fill in your listing first — it is the Listing tab. Your Space '
            'comes with it, and that is where you show parents how you teach.',
      );
}
