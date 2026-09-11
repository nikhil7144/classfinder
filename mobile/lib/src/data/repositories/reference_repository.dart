import '../api.dart';
import '../models/reference.dart';

/// Cities, areas and the taxonomy.
///
/// Public and cached by the service for a few minutes. Fetched once at launch
/// and kept for the session — these change only when an admin edits the
/// taxonomy or opens an area, and a form that re-reads them per picker is
/// paying for a round trip to render a list it already has.
class ReferenceRepository {
  const ReferenceRepository(this._api);

  final ApiClient _api;

  Future<Reference> all() async {
    final json = await _api.get('/api/v1/reference');
    return Reference.fromJson(json as Map<String, dynamic>);
  }
}
