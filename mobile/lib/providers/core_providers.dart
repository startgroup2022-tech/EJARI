import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../core/storage/preferences.dart';
import '../core/storage/secure_store.dart';
import '../services/api/ejari_api.dart';

final secureStoreProvider = Provider<SecureStore>((ref) => SecureStore());

final preferencesProvider = Provider<Preferences>((ref) => Preferences());

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(store: ref.watch(secureStoreProvider));
  ref.onDispose(() {});
  return client;
});

final ejariApiProvider = Provider<EjariApi>((ref) => EjariApi(ref.watch(apiClientProvider)));

/// Server-owned demo-mode flag (`GET /api/config`). False while loading or on any error,
/// so demo affordances never flash on a production build.
final demoModeProvider = FutureProvider<bool>((ref) async {
  return ref.watch(ejariApiProvider).demoEnabled();
});

/// Selected UI language. `null` means "follow the device".
class LocaleController extends StateNotifier<Locale?> {
  LocaleController(this._prefs) : super(null) {
    _load();
  }

  final Preferences _prefs;

  Future<void> _load() async => state = await _prefs.readLocale();

  Future<void> set(Locale? locale) async {
    state = locale;
    if (locale != null) await _prefs.writeLocale(locale);
  }
}

final localeProvider = StateNotifierProvider<LocaleController, Locale?>(
  (ref) => LocaleController(ref.watch(preferencesProvider)),
);

class ThemeModeController extends StateNotifier<ThemeMode> {
  ThemeModeController(this._prefs) : super(ThemeMode.system) {
    _load();
  }

  final Preferences _prefs;

  Future<void> _load() async {
    final stored = await _prefs.readThemeMode();
    if (stored != null) state = stored;
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    await _prefs.writeThemeMode(mode);
  }
}

final themeModeProvider = StateNotifierProvider<ThemeModeController, ThemeMode>(
  (ref) => ThemeModeController(ref.watch(preferencesProvider)),
);
