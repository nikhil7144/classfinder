import '../api.dart';
import '../models/alerts.dart';

/// The badge numbers.
class AlertsRepository {
  const AlertsRepository(this._api);

  final ApiClient _api;

  Future<Alerts> mine() async {
    final json = await _api.get('/api/v1/alerts');
    return Alerts.fromJson(json as Map<String, dynamic>);
  }
}
