import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../errors/api_exception.dart';
import '../storage/secure_store.dart';

/// Centralised HTTP client for the Ejari REST API.
///
/// Responsibilities:
///  * attaches the persisted `ejari_session` cookie to every request,
///  * captures a new session cookie when the backend issues one,
///  * maps transport failures and HTTP status codes onto [ApiException],
///  * emits a session-expired signal so the app can return to Login.
class ApiClient {
  ApiClient({required SecureStore store, Dio? dio})
      : _secureStore = store,
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: AppConfig.baseUrl,
                connectTimeout: AppConfig.connectTimeout,
                receiveTimeout: AppConfig.receiveTimeout,
                responseType: ResponseType.json,
                // The backend is the authority on status codes; we handle them ourselves
                // instead of letting Dio throw on 4xx so we can read the error body.
                validateStatus: (_) => true,
                headers: {'Accept': 'application/json'},
              ),
            );

  final Dio _dio;
  final SecureStore _secureStore;

  String? _sessionToken;

  /// Called when the backend reports an expired or invalid session.
  void Function()? onSessionExpired;

  bool get hasSession => _sessionToken != null;

  /// Base URL, exposed so the UI can build links the OS opens directly.
  String get baseUrl => _dio.options.baseUrl;

  /// Loads the persisted session token into memory. Returns true when present.
  Future<bool> restoreSession() async {
    _sessionToken = await _secureStore.readToken();
    return _sessionToken != null;
  }

  Future<void> _persistSessionFrom(Response<dynamic> res) async {
    final raw = res.headers.value('set-cookie');
    if (raw == null) return;
    final token = _extractSessionCookie(raw);
    if (token == null) return;
    _sessionToken = token;
    final data = res.data;
    final user = data is Map ? data['user'] : null;
    final userId = user is Map ? '${user['id'] ?? ''}' : '';
    final role = user is Map ? '${user['role'] ?? ''}' : '';
    await _secureStore.saveSession(token: token, userId: userId, role: role);
  }

  static String? _extractSessionCookie(String setCookie) {
    for (final part in setCookie.split(';')) {
      final trimmed = part.trim();
      if (trimmed.startsWith('${AppConfig.sessionCookieName}=')) {
        final value = trimmed.substring(AppConfig.sessionCookieName.length + 1);
        if (value.isEmpty) return null;
        return value;
      }
    }
    return null;
  }

  Future<void> clearSession() async {
    _sessionToken = null;
    await _secureStore.clear();
  }

  /// Seeds the in-memory token after a successful login without re-reading storage.
  Future<void> adoptSession(String token) async {
    _sessionToken = token;
    await _secureStore.saveSession(token: token, userId: '', role: '');
  }

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) =>
      _request<T>('GET', path, query: query);

  /// Fetches a binary body (document downloads). Bypasses JSON decoding.
  Future<Uint8List> getBytes(String path) async {
    try {
      final res = await _dio.get<List<int>>(
        path,
        options: Options(
          responseType: ResponseType.bytes,
          headers: {
            if (_sessionToken != null)
              'Cookie': '${AppConfig.sessionCookieName}=$_sessionToken',
          },
        ),
      );
      final status = res.statusCode ?? 0;
      if (status >= 200 && status < 300) {
        final data = res.data ?? const <int>[];
        return Uint8List.fromList(data);
      }
      if (status == 401) {
        await clearSession();
        onSessionExpired?.call();
        throw ApiException(ApiErrorKind.unauthorized, statusCode: status);
      }
      throw ApiException(
        status == 404 ? ApiErrorKind.notFound : ApiErrorKind.server,
        statusCode: status,
      );
    } on ApiException {
      rethrow;
    } on DioException catch (e) {
      throw ApiException(
        e.type == DioExceptionType.connectionTimeout || e.type == DioExceptionType.receiveTimeout
            ? ApiErrorKind.timeout
            : ApiErrorKind.network,
        message: e.message,
      );
    }
  }

  Future<T> post<T>(String path, {Object? body, Map<String, dynamic>? query}) =>
      _request<T>('POST', path, body: body, query: query);

  Future<T> delete<T>(String path, {Object? body}) => _request<T>('DELETE', path, body: body);

  Future<T> _request<T>(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
  }) async {
    try {
      final res = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(
          method: method,
          headers: {
            if (_sessionToken != null)
              'Cookie': '${AppConfig.sessionCookieName}=$_sessionToken',
          },
        ),
      );

      final status = res.statusCode ?? 0;

      if (status >= 200 && status < 300) {
        await _persistSessionFrom(res);
        if (res.data is T) return res.data as T;
        if (T == dynamic) return res.data as T;
        throw ApiException(
          ApiErrorKind.unknown,
          statusCode: status,
          message: 'Unexpected response type ${res.data.runtimeType} for $path',
        );
      }

      final errCode = res.data is Map ? res.data['error'] as String? : null;

      if (status == 401) {
        await clearSession();
        onSessionExpired?.call();
        throw ApiException(ApiErrorKind.unauthorized, statusCode: status, serverCode: errCode);
      }

      throw ApiException(
        switch (status) {
          403 => ApiErrorKind.forbidden,
          404 => ApiErrorKind.notFound,
          429 => ApiErrorKind.rateLimited,
          >= 500 => ApiErrorKind.server,
          >= 400 => ApiErrorKind.badRequest,
          _ => ApiErrorKind.unknown,
        },
        statusCode: status,
        serverCode: errCode,
      );
    } on ApiException {
      rethrow;
    } on DioException catch (e) {
      throw ApiException(switch (e.type) {
        DioExceptionType.connectionTimeout ||
        DioExceptionType.sendTimeout ||
        DioExceptionType.receiveTimeout =>
          ApiErrorKind.timeout,
        DioExceptionType.cancel => ApiErrorKind.cancelled,
        DioExceptionType.connectionError => ApiErrorKind.network,
        _ => ApiErrorKind.network,
      }, message: e.message);
    } catch (e) {
      throw ApiException(ApiErrorKind.unknown, message: '$e');
    }
  }
}
