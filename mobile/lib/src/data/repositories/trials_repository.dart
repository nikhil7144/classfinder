import '../api.dart';
import '../models/trial.dart';

/// First classes, arranged inside a conversation.
///
/// Keyed on the thread throughout, because thread_trials() is the only reader
/// and it restricts itself to participants — which is the whole access rule.
/// The writes carry which conversation they are in so every answer comes back
/// through the same function the list uses.
class TrialsRepository {
  const TrialsRepository(this._api);

  final ApiClient _api;

  Future<List<Trial>> forThread(String kind, String threadId) async {
    final json = await _api.get(
      '/api/v1/trials',
      query: {'kind': kind, 'threadId': threadId},
    );
    return (json as List)
        .map((e) => Trial.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Suggest a time. Either side may.
  Future<Trial> propose({
    required String kind,
    required String threadId,
    required DateTime scheduledAt,
    int durationMinutes = 60,
    String? place,
    String? placeNote,
    int? studentCount,
  }) async {
    final json = await _api.post(
      '/api/v1/trials',
      body: {
        'kind': kind,
        'threadId': threadId,
        'scheduledAt': scheduledAt.toUtc().toIso8601String(),
        'durationMinutes': durationMinutes,
        if (place != null) 'place': place,
        if (placeNote != null && placeNote.trim().isNotEmpty)
          'placeNote': placeNote.trim(),
        if (studentCount != null) 'studentCount': studentCount,
      },
    );
    return Trial.fromJson(json as Map<String, dynamic>);
  }

  /// Say yes or no to a time. The one who proposed it cannot confirm it.
  Future<Trial> respond({
    required String id,
    required String kind,
    required String threadId,
    required bool confirm,
  }) async {
    final json = await _api.patch(
      '/api/v1/trials/$id',
      body: {
        'kind': kind,
        'threadId': threadId,
        'status': confirm ? 'confirmed' : 'declined',
      },
    );
    return Trial.fromJson(json as Map<String, dynamic>);
  }

  /// Record what happened, from this side only.
  Future<Trial> setOutcome({
    required String id,
    required String kind,
    required String threadId,
    required TrialOutcome outcome,
  }) async {
    final json = await _api.patch(
      '/api/v1/trials/$id/outcome',
      body: {'kind': kind, 'threadId': threadId, 'outcome': outcome.id},
    );
    return Trial.fromJson(json as Map<String, dynamic>);
  }
}
