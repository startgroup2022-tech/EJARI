/// Environment configuration for the Ejari mobile client.
///
/// The base URL is injected at build time:
///   flutter build apk --release --dart-define=API_BASE_URL=https://api.ejari.bh
///
/// The default is the production API, so a release build can never accidentally
/// point at a developer machine.
class AppConfig {
  AppConfig._();

  /// Compile-time base URL. Never defaults to localhost/127.0.0.1.
  static const String _rawBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api.ejari.bh',
  );

  /// Normalised base URL without a trailing slash.
  static String get baseUrl =>
      _rawBaseUrl.endsWith('/') ? _rawBaseUrl.substring(0, _rawBaseUrl.length - 1) : _rawBaseUrl;

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 20);

  /// Session cookie name issued by the Ejari backend.
  static const String sessionCookieName = 'ejari_session';

  /// Ejari brand contact details, mirrored from the website footer.
  static const String supportPhone = '+973 1753 7070';
  static const String supportEmail = 'info@ejari.bh';
}
