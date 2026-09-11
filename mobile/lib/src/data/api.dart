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

  Future<dynamic> _send(Future<Response<dynamic>> Function() request) async {
    final Response<dynamic> response;
    try {
      response = await request();
    } on DioException catch (e) {
      // No status means it never arrived: no network, DNS, a timeout, or the
      // service being down. "Try again" rather than "you did something wrong".
      if (e.response == null) {
        throw const ApiException(
          "Couldn't reach Aspire91. Check your connection and try again.",
        );
      }
      throw ApiException(
        _message(e.response!.data, 'Something went wrong.'),
        statusCode: e.response!.statusCode,
      );
    }

    final status = response.statusCode ?? 0;
    if (status >= 200 && status < 300) return response.data;

    throw ApiException(_message(response.data, 'Something went wrong.'),
        statusCode: status);
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
