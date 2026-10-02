import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/errors/api_exception.dart';
import '../core/network/api_client.dart';
import '../models/app_user.dart';
import '../models/bootstrap.dart';
import '../services/api/ejari_api.dart';
import 'core_providers.dart';

sealed class AuthState {
  const AuthState();
}

class AuthUnknown extends AuthState {
  const AuthUnknown();
}

class AuthSignedOut extends AuthState {
  const AuthSignedOut({this.sessionExpired = false});

  /// True when the user was signed out because the backend rejected the session.
  final bool sessionExpired;
}

class AuthSignedIn extends AuthState {
  const AuthSignedIn({required this.user, required this.bootstrap});

  final AppUser user;
  final Bootstrap bootstrap;
}

/// Owns authentication and the role-scoped data snapshot.
///
/// The whole app reads business data from [AuthSignedIn.bootstrap], which the
/// backend scopes per role, so authorisation is enforced server-side.
class AuthController extends StateNotifier<AuthState> {
  AuthController(this._ref) : super(const AuthUnknown()) {
    _client.onSessionExpired = _handleSessionExpired;
  }

  final Ref _ref;

  ApiClient get _client => _ref.read(apiClientProvider);
  EjariApi get _api => _ref.read(ejariApiProvider);

  /// Restores a persisted session on cold start, if the backend still accepts it.
  Future<void> restore() async {
    final restored = await _client.restoreSession();
    if (!restored) {
      state = const AuthSignedOut();
      return;
    }
    try {
      final boot = await _api.bootstrap();
      state = AuthSignedIn(user: boot.me, bootstrap: boot);
    } on ApiException catch (e) {
      await _client.clearSession();
      state = AuthSignedOut(sessionExpired: e.isUnauthorized);
    }
  }

  Future<void> signIn({required String email, required String password}) async {
    final user = await _api.login(email: email, password: password);
    final boot = await _api.bootstrap();
    state = AuthSignedIn(user: boot.me.id.isNotEmpty ? boot.me : user, bootstrap: boot);
  }

  Future<void> signInDemo(String role) async {
    final user = await _api.demoLogin(role);
    final boot = await _api.bootstrap();
    state = AuthSignedIn(user: boot.me.id.isNotEmpty ? boot.me : user, bootstrap: boot);
  }

  Future<void> signOut() async {
    try {
      await _api.logout();
    } on ApiException {
      // A failed logout call must never trap the user in the app.
    }
    await _client.clearSession();
    state = const AuthSignedOut();
  }

  /// Re-fetches the role-scoped snapshot (pull-to-refresh, after a write action).
  Future<void> refresh() async {
    final current = state;
    if (current is! AuthSignedIn) return;
    final boot = await _api.bootstrap();
    state = AuthSignedIn(user: boot.me, bootstrap: boot);
  }

  void _handleSessionExpired() {
    if (state is AuthSignedIn) {
      state = const AuthSignedOut(sessionExpired: true);
    }
  }
}

final authProvider = StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController(ref);
});
