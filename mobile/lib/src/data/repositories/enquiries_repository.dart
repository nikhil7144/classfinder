import '../api.dart';

/// Starting a conversation with a coach, and the decisions inside one.
///
/// The family's direction only. A coach approaching a family goes through
/// StudentsRepository — two inserts into one table under two policies with
/// every clause inverted, and the API keeps them as two endpoints for that
/// reason.
class EnquiriesRepository {
  const EnquiriesRepository(this._api);

  final ApiClient _api;

  /// Write to a coach. Returns the conversation it opened.
  Future<String> create({
    required String providerId,
    required String message,
    String? serviceCategoryId,
    bool sharePhone = false,
  }) async {
    final json = await _api.post(
      '/api/v1/enquiries',
      body: {
        'providerId': providerId,
        'message': message.trim(),
        if (serviceCategoryId != null) 'serviceCategoryId': serviceCategoryId,
        'sharePhone': sharePhone,
      },
    );
    return (json as Map<String, dynamic>)['enquiryId'] as String;
  }

  /// Answer a coach who approached first. Accepting opens the conversation,
  /// declining closes it — and the phone is asked in the same breath because
  /// that is the moment somebody is deciding how reachable to be.
  Future<void> respond(
    String enquiryId, {
    required bool accept,
    bool sharePhone = false,
  }) =>
      _api.post(
        '/api/v1/enquiries/$enquiryId/respond',
        body: {'accept': accept, 'sharePhone': sharePhone},
      );

  /// Turn the number on or off. Revocable, and immediately.
  Future<void> setPhoneSharing(String enquiryId, bool share) =>
      _api.put('/api/v1/enquiries/$enquiryId/phone', body: {'share': share});
}
