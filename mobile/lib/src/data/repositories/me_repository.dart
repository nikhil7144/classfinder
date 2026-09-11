import '../api.dart';
import '../models/me.dart';

/// Who the caller is.
///
/// One call, and the one every screen after sign-in waits on: it decides the
/// role, whether the listing is finished, and whether it is approved.
class MeRepository {
  const MeRepository(this._api);

  final ApiClient _api;

  Future<Me> me() async {
    final json = await _api.get('/api/v1/me');
    return Me.fromJson(json as Map<String, dynamic>);
  }
}
