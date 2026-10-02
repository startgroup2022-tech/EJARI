import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Non-sensitive UI preferences (language + theme mode).
///
/// Kept in the same secure store to avoid an extra dependency; these values are
/// not secret but persisting them alongside the session keeps storage in one place.
class Preferences {
  Preferences({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _storage;

  static const _kLocale = 'ejari.locale';
  static const _kTheme = 'ejari.theme_mode';

  Future<Locale?> readLocale() async {
    final code = await _storage.read(key: _kLocale);
    if (code == null) return null;
    return Locale(code);
  }

  Future<void> writeLocale(Locale locale) =>
      _storage.write(key: _kLocale, value: locale.languageCode);

  Future<ThemeMode?> readThemeMode() async {
    final raw = await _storage.read(key: _kTheme);
    return switch (raw) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      'system' => ThemeMode.system,
      _ => null,
    };
  }

  Future<void> writeThemeMode(ThemeMode mode) =>
      _storage.write(key: _kTheme, value: mode.name);
}
