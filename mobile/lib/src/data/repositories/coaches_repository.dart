import '../api.dart';
import '../models/coach.dart';

/// What a parent searched for.
///
/// Held as a value rather than seven arguments so it can be a provider key —
/// Riverpod re-runs the search when any part of it changes, which is the whole
/// behaviour of the screen.
class SearchQuery {
  const SearchQuery({
    this.areaId,
    this.serviceCategoryId,
    this.lat,
    this.lng,
    this.radiusKm = 15,
  });

  final String? areaId;
  final String? serviceCategoryId;

  /// Where to measure from. Without these the service falls back to the
  /// area's centroid, which is why neither is required.
  final double? lat;
  final double? lng;

  final int radiusKm;

  /// Enough to ask. Without an area there is nothing to centre on and the
  /// screen waits rather than sending a search that means nothing.
  bool get isReady => areaId != null;

  SearchQuery copyWith({
    String? areaId,
    String? serviceCategoryId,
    double? lat,
    double? lng,
    int? radiusKm,
    bool clearService = false,
  }) =>
      SearchQuery(
        areaId: areaId ?? this.areaId,
        serviceCategoryId:
            clearService ? null : serviceCategoryId ?? this.serviceCategoryId,
        lat: lat ?? this.lat,
        lng: lng ?? this.lng,
        radiusKm: radiusKm ?? this.radiusKm,
      );

  @override
  bool operator ==(Object other) =>
      other is SearchQuery &&
      other.areaId == areaId &&
      other.serviceCategoryId == serviceCategoryId &&
      other.lat == lat &&
      other.lng == lng &&
      other.radiusKm == radiusKm;

  @override
  int get hashCode =>
      Object.hash(areaId, serviceCategoryId, lat, lng, radiusKm);
}

/// Finding a coach, and reading their page.
class CoachesRepository {
  const CoachesRepository(this._api);

  final ApiClient _api;

  Future<List<CoachResult>> search(SearchQuery query) async {
    final json = await _api.get(
      '/api/v1/providers/search',
      query: {
        'areaId': query.areaId,
        'serviceCategoryId': query.serviceCategoryId,
        'lat': query.lat,
        'lng': query.lng,
        'radiusKm': query.radiusKm,
      },
    );
    return (json as List)
        .map((e) => CoachResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// One coach's page. Readable signed out, like the web's.
  Future<CoachProfile> one(String id) async {
    final json = await _api.get('/api/v1/providers/$id');
    return CoachProfile.fromJson(json as Map<String, dynamic>);
  }
}
