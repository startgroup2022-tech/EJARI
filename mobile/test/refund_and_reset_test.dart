import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:ejari_mobile/core/errors/api_exception.dart';
import 'package:ejari_mobile/core/localization/app_strings.dart';
import 'package:ejari_mobile/core/localization/domain_labels.dart';
import 'package:ejari_mobile/core/network/api_client.dart';
import 'package:ejari_mobile/core/storage/secure_store.dart';
import 'package:ejari_mobile/core/theme/ejari_palette.dart';
import 'package:ejari_mobile/models/bootstrap.dart';
import 'package:ejari_mobile/models/refund.dart';
import 'package:ejari_mobile/routing/app_routes.dart';
import 'package:ejari_mobile/services/api/ejari_api.dart';
import 'package:flutter_test/flutter_test.dart';

/// Drives the genuine [ApiClient]/[EjariApi] pipeline with a stub adapter, so the
/// request paths, bodies and error mapping are exercised as real code.
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

ResponseBody _json(Object body, {int status = 200}) => ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
    );

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
  group('Refund model', () {
    test('parses the real bootstrap refund shape', () {
      final r = Refund.fromJson({
        'id': 'rf_1',
        'c': '12',
        'p': '88',
        'amount': 125.5,
        'why': {'ar': 'دفع مكرر', 'en': 'Duplicate payment'},
        'st': 'pending',
      });

      expect(r.id, 'rf_1');
      expect(r.contractId, '12');
      expect(r.paymentId, '88');
      expect(r.amount, 125.5);
      expect(r.reason.forLang('en'), 'Duplicate payment');
      expect(r.status, 'pending');
      expect(r.isPending, isTrue);
      expect(r.isApproved, isFalse);
    });

    test('defaults an unknown status to pending and a missing payment link to null', () {
      final r = Refund.fromJson({'id': 'rf_2', 'amount': 10, 'why': {}});
      expect(r.status, 'pending');
      expect(r.paymentId, isNull);
    });
  });

  group('Bootstrap refund lookup', () {
    test('finds the refund attached to a payment', () {
      final boot = Bootstrap.fromJson({
        'me': {'id': '7', 'role': 'tenant', 'name': {}},
        'refunds': [
          {'id': 'rf_1', 'c': '12', 'p': '88', 'amount': 20, 'why': {}, 'st': 'approved'},
          {'id': 'rf_2', 'c': '12', 'p': '99', 'amount': 30, 'why': {}, 'st': 'pending'},
        ],
      });

      expect(boot.refunds, hasLength(2));
      expect(boot.refundOfPayment('99')?.id, 'rf_2');
      expect(boot.refundOfPayment('does-not-exist'), isNull);
    });

    test('an empty payload yields no refunds', () {
      final boot = Bootstrap.fromJson({'me': {'id': '7', 'role': 'admin', 'name': {}}});
      expect(boot.refunds, isEmpty);
    });
  });

  group('Refund labels', () {
    test('maps every backend status to a localised label and tone', () {
      const ar = AppStringsAr();
      const en = AppStringsEn();

      expect(DomainLabels.refund('pending', ar), (ar.refundPending, Tone.warn));
      expect(DomainLabels.refund('approved', en), (en.refundApproved, Tone.success));
      expect(DomainLabels.refund('rejected', en), (en.refundRejected, Tone.danger));
    });
  });

  group('Auth: forgot / reset password API', () {
    late _MemoryStore store;
    late _FakeAdapter adapter;
    late EjariApi api;

    EjariApi build(ResponseBody Function(RequestOptions) responder) {
      adapter = _FakeAdapter(responder);
      final dio = Dio(BaseOptions(baseUrl: 'https://api.ejari.bh', validateStatus: (_) => true))
        ..httpClientAdapter = adapter;
      store = _MemoryStore();
      return EjariApi(ApiClient(store: store, dio: dio));
    }

    test('forgotPassword posts the email to the real endpoint', () async {
      api = build((_) => _json({'ok': true, 'message': 'generic'}));
      await api.forgotPassword('user@example.bh');

      final req = adapter.requests.single;
      expect(req.path, '/api/auth/forgot-password');
      expect(req.method, 'POST');
      expect((req.data as Map)['email'], 'user@example.bh');
    });

    test('checkResetToken reports a valid link', () async {
      api = build((_) => _json({'valid': true}));
      expect(await api.checkResetToken('tok-123'), 'valid');
      expect(adapter.requests.single.path, '/api/auth/reset-password/tok-123');
    });

    test('checkResetToken reports an expired link on 410', () async {
      api = build((_) => _json({'valid': false, 'reason': 'expired'}, status: 410));
      expect(await api.checkResetToken('tok-123'), 'expired');
    });

    test('checkResetToken reports an invalid link on 404', () async {
      api = build((_) => _json({'valid': false, 'reason': 'invalid'}, status: 404));
      expect(await api.checkResetToken('tok-123'), 'invalid');
    });

    test('resetPassword posts the token and the new password', () async {
      api = build((_) => _json({'ok': true}));
      await api.resetPassword(token: 'tok-123', password: 'newsecret1');

      final req = adapter.requests.single;
      expect(req.path, '/api/auth/reset-password');
      expect((req.data as Map)['token'], 'tok-123');
      expect((req.data as Map)['password'], 'newsecret1');
    });

    test('a weak password surfaces the backend error code', () async {
      api = build((_) => _json({'error': 'weak_password'}, status: 400));
      await expectLater(
        api.resetPassword(token: 'tok', password: 'short'),
        throwsA(isA<ApiException>().having((e) => e.serverCode, 'serverCode', 'weak_password')),
      );
    });
  });

  group('Refund API', () {
    late _FakeAdapter adapter;
    late EjariApi api;

    EjariApi build(ResponseBody Function(RequestOptions) responder) {
      adapter = _FakeAdapter(responder);
      final dio = Dio(BaseOptions(baseUrl: 'https://api.ejari.bh', validateStatus: (_) => true))
        ..httpClientAdapter = adapter;
      return EjariApi(ApiClient(store: _MemoryStore(), dio: dio));
    }

    test('requestRefund posts the payment id and both reason languages', () async {
      api = build((_) => _json({'ok': true, 'refund': 'rf_1', 'status': 'pending'}, status: 201));
      await api.requestRefund(paymentId: '88', reason: 'Duplicate payment');

      final req = adapter.requests.single;
      expect(req.path, '/api/refunds');
      expect(req.method, 'POST');
      final body = req.data as Map;
      expect(body['paymentId'], '88');
      expect(body['reasonAr'], 'Duplicate payment');
      expect(body['reasonEn'], 'Duplicate payment');
    });

    test('omits empty reasons rather than sending blank strings', () async {
      api = build((_) => _json({'ok': true}, status: 201));
      await api.requestRefund(paymentId: '88');

      final body = adapter.requests.single.data as Map;
      expect(body.containsKey('reasonAr'), isFalse);
      expect(body.containsKey('reasonEn'), isFalse);
    });

    test('a duplicate request surfaces already_requested', () async {
      api = build((_) => _json({'error': 'already_requested'}, status: 409));
      await expectLater(
        api.requestRefund(paymentId: '88'),
        throwsA(isA<ApiException>().having((e) => e.serverCode, 'serverCode', 'already_requested')),
      );
    });
  });

  group('Reset link routing', () {
    test('parses a web reset.html link', () {
      final route = AppRoutes.resetRouteFromUri(
        Uri.parse('https://api.ejari.bh/reset.html?token=abc123'),
      );
      expect(route, isNotNull);
      expect(Uri.parse(route!).path, AppRoutes.resetPassword);
      expect(Uri.parse(route).queryParameters['token'], 'abc123');
    });

    test('parses a native ejari:// deep link', () {
      final route = AppRoutes.resetRouteFromUri(Uri.parse('ejari://reset-password?token=xyz'));
      expect(Uri.parse(route!).queryParameters['token'], 'xyz');
    });

    test('ignores links that are not reset links', () {
      expect(AppRoutes.resetRouteFromUri(Uri.parse('https://api.ejari.bh/')), isNull);
      expect(AppRoutes.resetRouteFromUri(Uri.parse('https://api.ejari.bh/reset.html')), isNull);
    });

    test('extracts a token from a raw deep-link route name', () {
      expect(AppRoutes.resetTokenFromName('ejari://reset-password?token=deep1'), 'deep1');
      expect(AppRoutes.resetTokenFromName('${AppRoutes.resetPassword}?token=in1'), 'in1');
    });

    test('returns null for names that are not reset links', () {
      expect(AppRoutes.resetTokenFromName(''), isNull);
      expect(AppRoutes.resetTokenFromName(AppRoutes.resetPassword), isNull);
      expect(AppRoutes.resetTokenFromName('/contracts/detail'), isNull);
      expect(AppRoutes.resetTokenFromName('ejari://other?token=zzz'), isNull);
    });
  });
}
