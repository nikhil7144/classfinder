import '../api.dart';
import '../models/suggestion.dart';

/// Coaches worth looking at first, for a family that has said what it wants.
///
/// Ranked by the model when there are enough candidates to be worth asking,
/// and in plain distance order when there are not — `ranked` says which, and a
/// client should not pretend otherwise.
class SuggestionsRepository {
  const SuggestionsRepository(this._api);

  final ApiClient _api;

  Future<CoachSuggestions> coaches() async {
    final json = await _api.post('/api/v1/suggestions/coaches');
    return CoachSuggestions.fromJson(json as Map<String, dynamic>);
  }
}
