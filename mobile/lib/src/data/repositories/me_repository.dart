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

  /// Pick a side, once.
  ///
  /// Only settable while the account has no role; the service refuses to
  /// overwrite one, because doing so would skip switch_role's rules and leave
  /// an orphaned listing behind. Asking for the role you already have returns
  /// it rather than failing, so a retry after a dropped response is safe.
  Future<Me> chooseRole(String role) async {
    final json = await _api.put('/api/v1/me/role', body: {'role': role});
    return Me.fromJson(json as Map<String, dynamic>);
  }
}
