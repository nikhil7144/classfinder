import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_exception.dart';
import '../../data/location.dart';
import '../../data/models/reference.dart';
import '../../data/repositories/coaches_repository.dart';
import '../../providers.dart';
import '../../theme/theme.dart';
import '../../widgets/branding.dart';
import '../../widgets/states.dart';
import '../coach/coach_screen.dart';
import '../listing/fields.dart';
import '../listing/pickers.dart';
import '../listing/repeaters.dart' show areaOptions;
import 'coach_card.dart';

/// Matching the web's options exactly, so a parent who widens on one gets the
/// same set on the other.
const _radiusOptions = [5, 15, 30, 50];
const _defaultRadiusKm = 15;

/// Finding a coach — /search.
///
/// The screen a parent judges the product by, and the one thing they can do
/// before they have an account anywhere. Filters at the top, results under,
/// and when nothing is inside the radius it offers to widen rather than
/// showing an empty list and leaving them to guess why.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  SearchQuery _query = const SearchQuery(radiusKm: _defaultRadiusKm);
  bool _seeded = false;
  bool _locating = false;
  String? _locationNote;

  /// Start where the parent already said they were looking, and with what they
  /// already said they wanted. Typing it twice is the kind of thing that makes
  /// somebody close an app.
  void _seedFromProfile() {
    if (_seeded) return;
    final profile = ref.read(myProfileProvider).value;
    if (profile == null) return;

    _seeded = true;
    _query = _query.copyWith(
      areaId: profile.areaId,
      serviceCategoryId:
          profile.lookingFor.isEmpty ? null : profile.lookingFor.first,
      lat: profile.lat,
      lng: profile.lng,
    );
  }

  Future<void> _locate() async {
    setState(() {
      _locating = true;
      _locationNote = null;
    });

    final result = await findMe();
    if (!mounted) return;

    setState(() {
      _locating = false;
      if (result.ok) {
        _query = _query.copyWith(
          lat: result.position!.lat,
          lng: result.position!.lng,
        );
        _locationNote = 'Sorted from where you are.';
      } else {
        _locationNote = result.message;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final reference = ref.watch(referenceProvider);

    return reference.when(
      loading: () => const Scaffold(body: Loading()),
      error: (error, _) => Scaffold(
        appBar: AppBar(title: const Text('Find a coach')),
        body: ErrorState(
          message: error is ApiException
              ? error.message
              : 'Something went wrong loading the filters.',
          onRetry: () => ref.invalidate(referenceProvider),
        ),
      ),
      data: (reference) {
        _seedFromProfile();
        final results = ref.watch(searchProvider(_query));

        return Scaffold(
          body: SafeArea(
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(child: _filters(reference)),
                ...results.when(
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
                            : 'Something went wrong searching.',
                        onRetry: () => ref.invalidate(searchProvider(_query)),
                      ),
                    ),
                  ],
                  data: (coaches) => _results(reference, coaches),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  List<Widget> _results(Reference reference, List coaches) {
    if (!_query.isReady) {
      return const [
        SliverFillRemaining(
          hasScrollBody: false,
          child: EmptyState(
            title: 'Where are you looking?',
            body: 'Choose an area and we will show you who teaches there.',
          ),
        ),
      ];
    }

    if (coaches.isEmpty) {
      final widest = _radiusOptions.last;
      return [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Nobody here yet',
                    style: TextStyle(
                        color: A91.ink,
                        fontSize: 17,
                        fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    _query.radiusKm < widest
                        ? 'Nothing within ${_query.radiusKm} km. Try looking '
                            'further out.'
                        : 'Nothing within $widest km. Try a different area, or '
                            'clear what you are looking for.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: A91.muted, height: 1.6),
                  ),
                  // Widening is the answer more often than not, so it is a
                  // button rather than a suggestion.
                  if (_query.radiusKm < widest) ...[
                    const SizedBox(height: 18),
                    TextButton(
                      onPressed: () => setState(
                          () => _query = _query.copyWith(radiusKm: widest)),
                      child: Text(
                        'Search within $widest km',
                        style: const TextStyle(
                            color: A91.grad2, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ];
    }

    return [
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
        sliver: SliverList.builder(
          itemCount: coaches.length,
          itemBuilder: (context, i) => CoachCard(
            coach: coaches[i],
            reference: reference,
            // A distance is only meaningful when something was measured from.
            showDistance: _query.areaId != null,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => CoachScreen(coachId: coaches[i].id),
              ),
            ),
          ),
        ),
      ),
    ];
  }

  Widget _filters(Reference reference) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(left: 4),
              child: Eyebrow('Find a coach'),
            ),
            const SizedBox(height: 14),
            Field(
              label: 'Where',
              child: PickerField(
                value: _query.areaId == null
                    ? null
                    : reference.areaLabel(_query.areaId!),
                placeholder: 'Choose an area',
                onTap: () async {
                  final picked = await pickOne(
                    context,
                    title: 'Where are you looking',
                    selected: _query.areaId,
                    options: areaOptions(reference),
                  );
                  if (picked == null) return;
                  setState(() => _query = _query.copyWith(areaId: picked));
                },
              ),
            ),
            Field(
              label: 'What for',
              optional: true,
              child: PickerField(
                value: _query.serviceCategoryId == null
                    ? null
                    : reference.serviceName(_query.serviceCategoryId!),
                placeholder: 'Anything',
                onTap: () async {
                  final picked = await pickOne(
                    context,
                    title: 'What are you looking for',
                    selected: _query.serviceCategoryId,
                    options: [
                      const PickOption(id: '', label: 'Anything'),
                      for (final s in reference.serviceCategories)
                        PickOption(
                          id: s.id,
                          label: s.name,
                          sublabel: s.group,
                          dot: A91.group(s.group),
                        ),
                    ],
                  );
                  if (picked == null) return;
                  setState(() => _query = picked.isEmpty
                      ? _query.copyWith(clearService: true)
                      : _query.copyWith(serviceCategoryId: picked));
                },
              ),
            ),
            Field(
              label: 'How far',
              child: ChipWrap(
                children: [
                  for (final km in _radiusOptions)
                    ToggleChip(
                      label: '$km km',
                      selected: _query.radiusKm == km,
                      onTap: () => setState(
                          () => _query = _query.copyWith(radiusKm: km)),
                    ),
                ],
              ),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _locating ? null : _locate,
                icon: _locating
                    ? const SizedBox(
                        height: 15,
                        width: 15,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: A91.faint),
                      )
                    : const Icon(Icons.my_location, size: 17, color: A91.grad2),
                label: Text(
                  _locating ? 'Locating…' : 'Use my location',
                  style: const TextStyle(
                      color: A91.grad2, fontWeight: FontWeight.w600),
                ),
              ),
            ),
            if (_locationNote != null)
              Padding(
                padding: const EdgeInsets.only(left: 12, bottom: 6),
                child: Text(
                  _locationNote!,
                  style: const TextStyle(
                      color: A91.faint, fontSize: 12, height: 1.45),
                ),
              ),
          ],
        ),
      );
}
