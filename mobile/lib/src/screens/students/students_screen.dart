import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/states.dart';
import 'demand_card.dart';

/// Families looking for this coach. The home screen, and the reason to open
/// the app.
///
/// The list is not re-sorted here. students_for_provider() puts untouched rows
/// first, then nearest, then newest — a coach should see who they have not
/// answered yet rather than who happens to be closest, and that decision lives
/// where the query is.
class StudentsScreen extends ConsumerWidget {
  const StudentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(demandFeedProvider);
    final me = ref.watch(meProvider).value;
    final hasListing = me?.provider != null;

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          color: A91.grad1,
          backgroundColor: A91.surface,
          onRefresh: () async => ref.refresh(demandFeedProvider.future),
          child: feed.when(
            loading: () => const Loading(),
            error: (error, _) => ListView(
              // A ListView so pull-to-refresh still works on an error, which
              // is exactly when somebody wants to retry.
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                SizedBox(height: MediaQuery.sizeOf(context).height * 0.25),
                ErrorState(
                  message: error is ApiException
                      ? error.message
                      : 'Something went wrong loading your families.',
                  onRetry: () => ref.invalidate(demandFeedProvider),
                ),
              ],
            ),
            data: (demands) => CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                const SliverToBoxAdapter(child: _Header()),
                if (demands.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: hasListing
                        ? const EmptyState(
                            title: 'Nobody yet',
                            body:
                                'When a family near you says what they are looking for, '
                                'and it is something you teach, they will appear here.',
                          )
                        : const EmptyState(
                            title: 'Finish your listing first',
                            body:
                                'Families are matched to you by what you teach and where. '
                                'Until your listing is set up there is nothing to match.',
                          ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                    sliver: SliverList.builder(
                      itemCount: demands.length,
                      itemBuilder: (context, i) =>
                          DemandCard(demand: demands[i]),
                    ),
                  ),
              ],
            ),
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
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Wordmark(height: 30),
            const SizedBox(height: 22),
            const Eyebrow('Find students'),
            const SizedBox(height: 10),
            Text(
              'Families looking for you',
              style: Theme.of(context)
                  .textTheme
                  .headlineLarge
                  ?.copyWith(fontSize: 27),
            ),
            const SizedBox(height: 8),
            const Text(
              'Parents who have said what they want, and groups of neighbours who '
              'agreed on it together. Nearest first, and the ones you have not '
              'answered at the top.',
              style: TextStyle(color: A91.muted, height: 1.55, fontSize: 13.5),
            ),
          ],
        ),
      );
}
