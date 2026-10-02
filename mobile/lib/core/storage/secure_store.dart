import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Secure, Keystore-backed storage for the session cookie.
///
/// The Ejari backend authenticates with an HttpOnly `ejari_session` cookie.
/// A native client cannot rely on a browser cookie jar, so the cookie value is
/// captured from the login response and persisted here, encrypted at rest.
class SecureStore {
  SecureStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _storage;

  static const _kSessionToken = 'ejari.session_token';
  static const _kUserId = 'ejari.user_id';
  static const _kUserRole = 'ejari.user_role';

  Future<void> saveSession({required String token, required String userId, required String role}) async {
    await _storage.write(key: _kSessionToken, value: token);
    await _storage.write(key: _kUserId, value: userId);
    await _storage.write(key: _kUserRole, value: role);
  }

  Future<String?> readToken() => _storage.read(key: _kSessionToken);
  Future<String?> readUserId() => _storage.read(key: _kUserId);
  Future<String?> readRole() => _storage.read(key: _kUserRole);

  Future<void> clear() async {
    await _storage.delete(key: _kSessionToken);
    await _storage.delete(key: _kUserId);
    await _storage.delete(key: _kUserRole);
  }
}
