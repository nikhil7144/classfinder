/// Build-time configuration.
///
/// Passed with --dart-define rather than read from a bundled .env, so nothing
/// config-shaped ships as a readable asset. The anon key is public by design —
/// it is already in the web bundle — but the API base URL differs per
/// environment and belongs on the build command.
///
///   flutter run --flavor seeker -t lib/main_seeker.dart \
///     --dart-define=SUPABASE_URL=https://wpegcnmqygdaqrjhryit.supabase.co \
///     --dart-define=SUPABASE_ANON_KEY=... \
///     --dart-define=API_BASE_URL=https://api.aspire91.com
class Env {
  const Env._();

  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL');

  /// Fail at startup with a sentence, rather than on the first request with a
  /// null-ish URL and a confusing socket error.
  static void assertConfigured() {
    final missing = <String>[
      if (supabaseUrl.isEmpty) 'SUPABASE_URL',
      if (supabaseAnonKey.isEmpty) 'SUPABASE_ANON_KEY',
      if (apiBaseUrl.isEmpty) 'API_BASE_URL',
    ];
    if (missing.isNotEmpty) {
      throw StateError(
        'Missing --dart-define values: ${missing.join(', ')}. '
        'See mobile/README.md for the run command.',
      );
    }
  }
}
