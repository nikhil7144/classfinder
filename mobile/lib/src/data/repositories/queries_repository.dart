import '../api.dart';
import '../models/query.dart';

/// Queries — leads, not conversations.
///
/// One read serves both sides: "participants read queries" returns a coach
/// their leads and a parent their own requests, so there is no role argument
/// here and none is wanted.
class QueriesRepository {
  const QueriesRepository(this._api);

  final ApiClient _api;

  Future<List<Query>> mine({QueryStatus? status}) async {
    final json = await _api.get(
      '/api/v1/queries',
      query: {'status': status?.id},
    );
    return (json as List)
        .map((e) => Query.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Ask a coach to ring you.
  ///
  /// The family's side. A number is required, unlike on an enquiry: the point
  /// of a query is to be called, so one without a number is a request nobody
  /// can act on.
  Future<Query> raise({
    required String providerId,
    required String contactName,
    required String contactPhone,
    String? serviceCategoryId,
    String? details,
  }) async {
    final json = await _api.post(
      '/api/v1/queries',
      body: {
        'providerId': providerId,
        'contactName': contactName.trim(),
        'contactPhone': contactPhone.trim(),
        if (serviceCategoryId != null) 'serviceCategoryId': serviceCategoryId,
        if (details != null && details.trim().isNotEmpty)
          'details': details.trim(),
      },
    );
    return Query.fromJson(json as Map<String, dynamic>);
  }

  /// Move the lead along. `callbackAt` is required when booking a call and
  /// ignored otherwise — the service and a check constraint both say so.
  Future<Query> setStatus(
    String id,
    QueryStatus status, {
    DateTime? callbackAt,
  }) async {
    final json = await _api.patch(
      '/api/v1/queries/$id/status',
      body: {
        'status': status.id,
        if (callbackAt != null)
          'callbackAt': callbackAt.toUtc().toIso8601String(),
      },
    );
    return Query.fromJson(json as Map<String, dynamic>);
  }

  /// Answer it in writing. Returns the conversation to open — an existing
  /// thread with this family if there was one, so a parent never ends up with
  /// two conversations for one coach.
  ///
  /// Writing also moves a 'new' lead to 'contacted', in the same function, so
  /// a coach does not have to remember to do both.
  Future<String> answer(String id, String message) async {
    final json = await _api.post(
      '/api/v1/queries/$id/answer',
      body: {'message': message},
    );
    return (json as Map<String, dynamic>)['enquiryId'] as String;
  }

  Future<void> markRead(String id) => _api.post('/api/v1/queries/$id/read');
}
