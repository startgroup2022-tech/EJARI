import '../errors/api_exception.dart';
import '../localization/app_strings.dart';

/// Maps an [ApiException] onto a localised, user-facing sentence.
String describeApiError(ApiException e, AppStrings s) {
  // Prefer the specific backend error code when we recognise it.
  switch (e.serverCode) {
    case 'invalid_credentials':
      return s.errInvalidCredentials;
    case 'suspended':
      return s.errSuspended;
    case 'weak_password':
      return s.errWeakPassword;
    case 'wrong_password':
      return s.errWrongPassword;
    case 'too_many_requests':
      return s.errRateLimited;
    case 'no_active_contract':
      return s.noContracts;
    case 'service_not_found':
      return s.errNotFound;
    case 'unauthenticated':
      return s.sessionExpired;
  }

  return switch (e.kind) {
    ApiErrorKind.network => s.errNetwork,
    ApiErrorKind.timeout => s.errTimeout,
    ApiErrorKind.cancelled => s.errUnknown,
    ApiErrorKind.unauthorized => s.sessionExpired,
    ApiErrorKind.forbidden => s.errForbidden,
    ApiErrorKind.notFound => s.errNotFound,
    ApiErrorKind.badRequest => s.errBadRequest,
    ApiErrorKind.rateLimited => s.errRateLimited,
    ApiErrorKind.server => s.errServer,
    ApiErrorKind.unknown => s.errUnknown,
  };
}
