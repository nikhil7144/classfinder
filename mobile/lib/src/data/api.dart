import 'package:dio/dio.dart';

import '../config/env.dart';
import 'api_exception.dart';
import 'supabase.dart';

/// The client for api.aspire91.com.
///
/// Pure Dart on purpose: nothing here imports a state library, so this layer
/// stays testable and survives a change of mind about Riverpod. Screens talk
/// to repositories, repositories talk to this.
///
/// Every non-2xx becomes an ApiException carrying the service's own sentence.
/// The alternative — handing Dio errors to the screens — means every screen
/// learns the shape of an error body, and they get it subtly different.
class ApiClient {
  ApiClient({Dio? dio, TokenReader? token})
      : _token = token ?? currentAccessToken,
        _dio = dio ?? Dio() {
    _dio.options = BaseOptions(
      baseUrl: Env.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      // Let 4xx through to be read for its message rather than thrown as a
      // transport failure. 5xx still throws, because there is nothing to read.
      validateStatus: (status) => status != null && status < 500,
    );
  }

  final Dio _dio;
  final TokenReader _token;

  /// Shared by every request that hits a 401 at once, so five tabs mounting
  /// together (`HomeShell` builds all five children) refresh the session
  /// once rather than racing five separate refreshes.
  Future<bool>? _refreshing;

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) => _send(
      () => _dio.get(path, queryParameters: _clean(query), options: _auth()));

  Future<dynamic> post(String path, {Object? body}) =>
      _send(() => _dio.post(path, data: body, options: _auth()));

  Future<dynamic> put(String path, {Object? body}) =>
      _send(() => _dio.put(path, data: body, options: _auth()));

  Future<dynamic> patch(String path, {Object? body}) =>
      _send(() => _dio.patch(path, data: body, options: _auth()));

  Future<dynamic> delete(String path) =>
      _send(() => _dio.delete(path, options: _auth()));

  /// Read fresh every request. supabase_flutter refreshes the session
  /// underneath us, and a token held in a field goes stale without saying so.
  Options _auth() {
    final token = _token();
    return Options(
        headers: token == null ? null : {'Authorization': 'Bearer $token'});
  }

  /// Dio turns a null query value into the string "null", which the service
  /// then fails to parse as a uuid. Drop them instead.
  Map<String, dynamic>? _clean(Map<String, dynamic>? query) {
    if (query == null) return null;
    final out = <String, dynamic>{};
    query.forEach((key, value) {
      if (value != null) out[key] = value;
    });
    return out.isEmpty ? null : out;
  }

  /// `supabase_flutter` hands back a *stored* access token on a cold start
  /// and refreshes it in the background — a request that goes out in that
  /// window 401s on a session that is actually fine. One retry after one
  /// refresh tells the two apart: a token that merely needed a nudge
  /// succeeds; a session that is genuinely gone still fails, and only then
  /// do we sign out. Signing out on the first 401 would be the same bug
  /// GateScreen used to show every launch.
  Future<dynamic> _send(Future<Response<dynamic>> Function() request) async {
    final response = await _attempt(request);

    if (response.statusCode == 401) {
      if (await _refreshSessionOnce()) {
        return _result(await _attempt(request));
      }
      // The refresh itself failed — this is the real "session is no longer
      // valid", not a token that merely needed a nudge.
      await supabase.auth.signOut();
    }

    return _result(response);
  }

  Future<Response<dynamic>> _attempt(
    Future<Response<dynamic>> Function() request,
  ) async {
    try {
      return await request();
    } on DioException catch (e) {
      // No status means it never arrived: no network, DNS, a timeout, or the
      // service being down. "Try again" rather than "you did something wrong".
      if (e.response == null) {
        throw const ApiException(
          "Couldn't reach Aspire91. Check your connection and try again.",
        );
      }
      return e.response!;
    }
  }

  dynamic _result(Response<dynamic> response) {
    final status = response.statusCode ?? 0;
    if (status >= 200 && status < 300) return response.data;

    throw ApiException(_message(response.data, 'Something went wrong.'),
        statusCode: status);
  }

  /// One refresh shared by every concurrent 401, not one per request.
  ///
  /// Timed out explicitly: unlike every Dio call above, `refreshSession()`
  /// carries no timeout of its own, and this Future is shared by every
  /// in-flight request. A refresh that hangs — rather than fails outright —
  /// would otherwise strand every screen waiting on the API on its skeleton
  /// forever, with no error and no retry to press.
  Future<bool> _refreshSessionOnce() {
    return _refreshing ??= () async {
      try {
        await supabase.auth
            .refreshSession()
            .timeout(const Duration(seconds: 15));
        return true;
      } catch (_) {
        return false;
      }
    }()
        .whenComplete(() => _refreshing = null);
  }

  /// The service's own sentence wherever it wrote one.
  ///
  /// Nest returns validation failures as a list and everything else as a
  /// string. Replacing either with a generic line throws away the most precise
  /// thing anyone knows about what went wrong — the web learned that the hard
  /// way with "Couldn't load your events".
  static String _message(dynamic body, String fallback) {
    if (body is Map) {
      final message = body['message'];
      if (message is List && message.isNotEmpty) {
        return message.first.toString();
      }
      if (message is String && message.isNotEmpty) return message;
    }
    return fallback;
  }
}

typedef TokenReader = String? Function();
