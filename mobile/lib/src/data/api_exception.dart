/// What went wrong, in words a reader can act on.
///
/// The service answers a refusal with a sentence worth showing — "Finish your
/// coach or company profile before creating an event" — and validation arrives
/// as a list. Throwing this rather than a Dio error means the screens deal in
/// one type, and none of them has to know the shape of an error body.
class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  /// Already fit to put in front of somebody.
  final String message;

  /// Null when the request never reached the service.
  final int? statusCode;

  /// The caller is not signed in, or their token has expired.
  bool get isUnauthorized => statusCode == 401;

  /// They are signed in and still may not. Usually something to finish first.
  bool get isForbidden => statusCode == 403;

  bool get notFound => statusCode == 404;

  /// Nothing reached the server. Worth distinguishing, because the answer is
  /// "try again" rather than "you did something wrong".
  bool get isOffline => statusCode == null;

  @override
  String toString() => message;
}
