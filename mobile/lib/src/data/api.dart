import 'package:dio/dio.dart';

import '../config/env.dart';
import 'supabase.dart';

/// The HTTP client for api.aspire91.com.
///
/// This is a thin Dio configured with the base URL and the bearer token. The
/// typed client is generated from api/openapi.json into
/// lib/src/data/generated/ — see tool/gen_api_client.sh. That directory is
/// gitignored for the same reason lib/api/schema.d.ts is generated on the web:
/// the contract is emitted from the DTOs that validate at runtime, never
/// hand-written.
Dio buildApiClient() {
  final dio = Dio(
    BaseOptions(
      baseUrl: Env.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      // The API answers 4xx with a sentence worth showing. Let those through
      // to the caller rather than throwing on status alone.
      validateStatus: (status) => status != null && status < 500,
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        final token = currentAccessToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
    ),
  );

  return dio;
}

/// The API's own sentence, wherever it wrote one.
///
/// The service turns a refused policy into a message a reader can act on —
/// "Finish your coach or company profile before creating an event" — and
/// validation failures arrive as a list. Replacing either with a generic
/// string throws away the most precise thing anyone knows about what went
/// wrong. The web learned this the hard way; see lib/api/my-events.ts.
String apiMessage(Object? body, String fallback) {
  if (body is Map && body['message'] != null) {
    final message = body['message'];
    if (message is List && message.isNotEmpty) return message.first.toString();
    return message.toString();
  }
  return fallback;
}
