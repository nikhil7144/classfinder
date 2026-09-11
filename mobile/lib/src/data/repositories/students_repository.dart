import '../api.dart';
import '../models/demand.dart';

/// Who is looking, near this coach — and writing to them.
class StudentsRepository {
  const StudentsRepository(this._api);

  final ApiClient _api;

  /// The demand feed.
  ///
  /// Ordering is the service's: untouched rows first, then nearest, then
  /// newest. A coach opening this should see who they have not answered yet
  /// rather than who happens to be closest, so the list is not re-sorted here.
  Future<List<Demand>> feed({
    required String providerId,
    String? serviceCategoryId,
    String? areaId,
    int? radiusKm,
    int? limit,
  }) async {
    final json = await _api.get('/api/v1/students', query: {
      'providerId': providerId,
      'serviceCategoryId': serviceCategoryId,
      'areaId': areaId,
      'radiusKm': radiusKm,
      'limit': limit,
    });

    return (json as List)
        .map((e) => Demand.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Write to a family, or to a group of them.
  ///
  /// One message. The service refuses a second before the family has answered,
  /// and refuses a repeat pitch to the same group outright — so a screen should
  /// not offer either, and the endpoint is the backstop rather than the rule.
  Future<void> approach({
    required String kind,
    required String targetId,
    required String providerId,
    required String message,
    String? serviceCategoryId,
  }) =>
      _api.post('/api/v1/students/$kind/$targetId/approach', body: {
        'providerId': providerId,
        'message': message,
        if (serviceCategoryId != null) 'serviceCategoryId': serviceCategoryId,
      });
}
