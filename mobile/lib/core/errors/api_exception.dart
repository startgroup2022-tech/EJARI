/// A failure raised by the API layer, carrying a stable, localisable kind.
enum ApiErrorKind {
  network,
  timeout,
  cancelled,
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  rateLimited,
  server,
  unknown,
}

class ApiException implements Exception {
  ApiException(this.kind, {this.statusCode, this.serverCode, this.message});

  final ApiErrorKind kind;
  final int? statusCode;

  /// The machine-readable `error` code returned by the Ejari backend,
  /// e.g. `invalid_credentials`, `suspended`, `too_many_requests`.
  final String? serverCode;
  final String? message;

  bool get isUnauthorized => kind == ApiErrorKind.unauthorized;

  @override
  String toString() =>
      'ApiException(${kind.name}, status: $statusCode, code: $serverCode, message: $message)';
}
