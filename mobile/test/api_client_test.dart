import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:ejari_mobile/core/errors/api_exception.dart';
import 'package:ejari_mobile/core/network/api_client.dart';
import 'package:ejari_mobile/core/storage/secure_store.dart';
import 'package:flutter_test/flutter_test.dart';

/// A real HTTP adapter substitute: [ApiClient] runs its genuine request,
/// cookie-capture and error-mapping code, only the socket is replaced.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.responder);

  final ResponseBody Function(RequestOptions options) responder;

  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return responder(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Object body, {int status = 200, String? setCookie}) {
  return ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
      if (setCookie != null) 'set-cookie': [setCookie],
    },
  );
}

/// In-memory stand-in for the Keystore-backed store, so the test never touches
/// platform channels while still exercising the real persistence contract.
class _MemoryStore implements SecureStore {
  final Map<String, String> values = {};

  @override
  Future<void> saveSession({required String token, required String userId, required String role}) async {
    values['token'] = token;
    values['userId'] = userId;
    values['role'] = role;
  }

  @override
  Future<String?> readToken() async => values['token'];

  @override
  Future<String?> readUserId() async => values['userId'];

  @override
  Future<String?> readRole() async => values['role'];

  @override
  Future<void> clear() async => values.clear();
}

void main() {
  late _MemoryStore store;
  late _FakeAdapter adapter;
  late ApiClient client;

  ApiClient build(ResponseBody Function(RequestOptions) responder) {
    adapter = _FakeAdapter(responder);
    final dio = Dio(BaseOptions(baseUrl: 'https://api.ejari.bh', validateStatus: (_) => true))
      ..httpClientAdapter = adapter;
    store = _MemoryStore();
    return ApiClient(store: store, dio: dio);
  }

  group('session handling', () {
    test('captures the session cookie from a login response', () async {
      client = build((_) => _json(
            {'user': {'id': '7', 'role': 'landlord', 'name': {}}},
            setCookie: 'ejari_session=abc123; Path=/; HttpOnly; SameSite=Lax',
          ));

      final res = await client.post<Map<String, dynamic>>('/api/auth/login', body: {'email': 'x'});

      expect(res['user']['id'], '7');
      expect(client.hasSession, isTrue);
      expect(await store.readToken(), 'abc123');
      expect(await store.readUserId(), '7');
      expect(await store.readRole(), 'landlord');
    });

    test('sends the stored cookie on later requests', () async {
      client = build((_) => _json({'ok': true}));
      await client.adoptSession('token-xyz');

      await client.get<Map<String, dynamic>>('/api/bootstrap');

      expect(adapter.requests.single.headers['Cookie'], 'ejari_session=token-xyz');
    });

    test('sends no Cookie header before a session exists', () async {
      client = build((_) => _json({'ok': true}));
      await client.get<Map<String, dynamic>>('/api/bootstrap');
      expect(adapter.requests.single.headers.containsKey('Cookie'), isFalse);
    });

    test('restores a persisted session on cold start', () async {
      client = build((_) => _json({'ok': true}));
      await store.saveSession(token: 'persisted', userId: '7', role: 'landlord');

      expect(await client.restoreSession(), isTrue);
      expect(client.hasSession, isTrue);
    });

    test('reports no session when storage is empty', () async {
      client = build((_) => _json({'ok': true}));
      expect(await client.restoreSession(), isFalse);
    });

    test('ignores a set-cookie header without our cookie name', () async {
      client = build((_) => _json(
            {'user': {'id': '7', 'role': 'tenant', 'name': {}}},
            setCookie: 'other_cookie=zzz; Path=/',
          ));
      await client.post<Map<String, dynamic>>('/api/auth/login');
      expect(client.hasSession, isFalse);
    });

    test('ignores an empty session cookie value', () async {
      client = build((_) => _json(
            {'user': {'id': '7', 'role': 'tenant', 'name': {}}},
            setCookie: 'ejari_session=; Path=/',
          ));
      await client.post<Map<String, dynamic>>('/api/auth/login');
      expect(client.hasSession, isFalse);
    });
  });

  group('error mapping', () {
    test('401 clears the session and signals expiry', () async {
      client = build((_) => _json({'error': 'unauthenticated'}, status: 401));
      await client.adoptSession('stale');

      var expired = false;
      client.onSessionExpired = () => expired = true;

      await expectLater(
        client.get<Map<String, dynamic>>('/api/bootstrap'),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.unauthorized)),
      );
      expect(expired, isTrue);
      expect(client.hasSession, isFalse);
      expect(await store.readToken(), isNull);
    });

    test('403 maps to forbidden and keeps the session', () async {
      client = build((_) => _json({'error': 'forbidden'}, status: 403));
      await client.adoptSession('good');

      await expectLater(
        client.post<Map<String, dynamic>>('/api/media'),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.forbidden)),
      );
      expect(client.hasSession, isTrue);
    });

    test('404 maps to notFound', () async {
      client = build((_) => _json({'error': 'not_found'}, status: 404));
      await expectLater(
        client.get<Map<String, dynamic>>('/api/nope'),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.notFound)),
      );
    });

    test('429 maps to rateLimited and preserves the server code', () async {
      client = build((_) => _json({'error': 'too_many_requests'}, status: 429));
      await expectLater(
        client.post<Map<String, dynamic>>('/api/auth/password'),
        throwsA(isA<ApiException>()
            .having((e) => e.kind, 'kind', ApiErrorKind.rateLimited)
            .having((e) => e.serverCode, 'serverCode', 'too_many_requests')),
      );
    });

    test('500 maps to server', () async {
      client = build((_) => _json({'error': 'boom'}, status: 500));
      await expectLater(
        client.get<Map<String, dynamic>>('/api/bootstrap'),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.server)),
      );
    });

    test('400 surfaces the backend error code for the UI to localise', () async {
      client = build((_) => _json({'error': 'invalid_credentials'}, status: 400));
      await expectLater(
        client.post<Map<String, dynamic>>('/api/auth/login'),
        throwsA(isA<ApiException>()
            .having((e) => e.serverCode, 'serverCode', 'invalid_credentials')
            .having((e) => e.kind, 'kind', ApiErrorKind.badRequest)),
      );
    });

    test('a connection failure maps to network', () async {
      client = build((options) => throw DioException.connectionError(
            requestOptions: options,
            reason: 'offline',
          ));
      await expectLater(
        client.get<Map<String, dynamic>>('/api/bootstrap'),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.network)),
      );
    });

    test('a timeout maps to timeout', () async {
      client = build((options) => throw DioException.receiveTimeout(
            timeout: const Duration(seconds: 1),
            requestOptions: options,
          ));
      await expectLater(
        client.get<Map<String, dynamic>>('/api/bootstrap'),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.timeout)),
      );
    });
  });

  group('binary download', () {
    test('returns the raw bytes of a document', () async {
      client = build((_) => ResponseBody.fromString(
            'PDFDATA',
            200,
            headers: {
              Headers.contentTypeHeader: ['application/pdf'],
            },
          ));
      await client.adoptSession('tok');

      final bytes = await client.getBytes('/api/documents/1/download');

      expect(String.fromCharCodes(bytes), 'PDFDATA');
      expect(adapter.requests.single.headers['Cookie'], 'ejari_session=tok');
    });

    test('a 401 on download clears the session', () async {
      client = build((_) => ResponseBody.fromString('', 401));
      await client.adoptSession('tok');
      await expectLater(
        client.getBytes('/api/documents/1/download'),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.unauthorized)),
      );
      expect(client.hasSession, isFalse);
    });
  });
}
