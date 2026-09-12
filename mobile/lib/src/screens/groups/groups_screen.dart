import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/models/group.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/states.dart';
import 'group_form_screen.dart';
import 'group_screen.dart';

/// Groups this family is in — /account/groups.
///
/// Made or joined, both, because to a member they are the same thing: a group
/// of neighbours waiting for a coach. What differs is who may answer a pitch,
/// and that is said on the group itself rather than by splitting the list.
class GroupsScreen extends ConsumerWidget {
  const GroupsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groups = ref.watch(myGroupsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Your groups')),
      body: SafeArea(
        child: RefreshIndicator(
          color: A91.grad1,
          backgroundColor: A91.surface,
          onRefresh: () async {
            ref.invalidate(myGroupsProvider);
            await ref.read(myGroupsProvider.future);
          },
          child: groups.when(
            loading: () => const ListSkeleton(avatar: false),
            error: (error, _) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                SizedBox(height: MediaQuery.sizeOf(context).height * 0.2),
                ErrorState(
                  message: error is ApiException
                      ? error.message
                      : 'Something went wrong loading your groups.',
                  onRetry: () => ref.invalidate(myGroupsProvider),
                ),
              ],
            ),
            data: (groups) {
              if (groups.isEmpty) return const _Empty();

              // Live ones first: a group still taking pitches is a thing to
              // watch, and one that has ended is a record.
              final sorted = [...groups]..sort((a, b) {
                  if (a.isActive != b.isActive) return a.isActive ? -1 : 1;
                  return b.createdAt.compareTo(a.createdAt);
                });

              return ListView.builder(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 90),
                itemCount: sorted.length,
                itemBuilder: (context, i) => _GroupCard(group: sorted[i]),
              );
            },
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const GroupFormScreen()),
        ),
        backgroundColor: A91.grad1,
        foregroundColor: A91.onAccent,
        icon: const Icon(Icons.add),
        label: const Text('Start a group',
            style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(height: MediaQuery.sizeOf(context).height * 0.18),
          const EmptyState(
            title: 'No groups yet',
            body: 'Four families in one society asking together is a class '
                'worth travelling for. One family asking alone is a lead. '
                'Start one, send the link to your neighbours, and coaches come '
                'to you.',
          ),
        ],
      );
}

class _GroupCard extends StatelessWidget {
  const _GroupCard({required this.group});

  final Group group;

  @override
  Widget build(BuildContext context) {
    final dormant = group.dormantReason;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: A91.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: A91.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => GroupScreen(group: group)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 15, 16, 14),
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
                          group.serviceName ?? 'A group',
                          style: const TextStyle(
                            color: A91.ink,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          [
                            if (group.societyName != null) group.societyName!,
                            if (group.areaName != null) group.areaName!,
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style:
                              const TextStyle(color: A91.faint, fontSize: 12.5),
                        ),
                      ],
                    ),
                  ),
                  // Only the creator ever sees a pitch count, and the service
                  // is what decides that — this just renders what it got.
                  if (group.pendingRequests > 0)
                    _Pill(
                      text: '${group.pendingRequests} waiting',
                      tone: A91.grad1,
                    )
                  else if (dormant != null)
                    _Pill(text: dormant, tone: A91.faint)
                  else
                    _Pill(text: group.remaining, tone: A91.teal),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Icon(Icons.group_outlined, size: 15, color: A91.faint),
                  const SizedBox(width: 7),
                  Text(
                    '${group.memberCount} '
                    '${group.memberCount == 1 ? 'family' : 'families'} · '
                    'wants ${group.studentCount} '
                    '${group.studentCount == 1 ? 'place' : 'places'}',
                    style: const TextStyle(color: A91.muted, fontSize: 12.5),
                  ),
                  const Spacer(),
                  if (group.isCreator)
                    const Text(
                      'Yours',
                      style: TextStyle(
                          color: A91.faint,
                          fontSize: 11,
                          fontWeight: FontWeight.w600),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, required this.tone});

  final String text;
  final Color tone;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(left: 8),
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: tone.withValues(alpha: 0.32)),
        ),
        child: Text(
          text,
          style: TextStyle(
              color: tone, fontSize: 10.5, fontWeight: FontWeight.w700),
        ),
      );
}
