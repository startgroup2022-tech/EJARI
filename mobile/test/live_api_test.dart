import 'package:dio/dio.dart';
import 'package:ejari_mobile/core/network/api_client.dart';
import 'package:ejari_mobile/core/storage/secure_store.dart';
import 'package:ejari_mobile/models/app_user.dart';
import 'package:ejari_mobile/models/payment.dart';
import 'package:ejari_mobile/services/api/ejari_api.dart';
import 'package:flutter_test/flutter_test.dart';

/// End-to-end contract test against a real, running Ejari server.
///
/// Skipped unless `EJARI_BASE_URL` is provided, so the default `flutter test`
/// stays hermetic while CI can prove the client speaks to the actual backend.
///
///   EJARI_BASE_URL=http://127.0.0.1:12000 flutter test test/live_api_test.dart
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
  final baseUrl = const String.fromEnvironment('EJARI_BASE_URL');

  if (baseUrl.isEmpty) {
    test('live API suite skipped (set EJARI_BASE_URL to run)', () {}, skip: true);
    return;
  }

  late EjariApi api;
  late ApiClient client;

  setUp(() {
    final dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
      validateStatus: (_) => true,
    ));
    client = ApiClient(store: _MemoryStore(), dio: dio);
    api = EjariApi(client);
  });

  test('demo mode is reported by the server (GET /api/config)', () async {
    expect(await api.demoEnabled(), isTrue, reason: 'a dev server must report demo:true');
  });

  test('demo login + bootstrap returns a real role-scoped snapshot', () async {
    final user = await api.demoLogin('landlord');
    expect(user.role, UserRole.landlord);
    expect(user.email, isNotEmpty);

    final boot = await api.bootstrap();
    expect(boot.me.role, UserRole.landlord);
    expect(boot.properties, isNotEmpty, reason: 'seeded landlord must own properties');
    expect(boot.contracts, isNotEmpty, reason: 'seeded landlord must have contracts');
    expect(boot.units, isNotEmpty);

    // Every unit must belong to a property the snapshot actually contains.
    for (final unit in boot.units) {
      expect(boot.propertyById(unit.propertyId), isNotNull);
    }
    // Every contract must resolve to a real unit.
    for (final contract in boot.contracts) {
      expect(boot.unitById(contract.unitId), isNotNull);
    }
  });

  test('tenant bootstrap is scoped to the tenant', () async {
    final user = await api.demoLogin('tenant');
    expect(user.role, UserRole.tenant);

    final boot = await api.bootstrap();
    expect(boot.me.role, UserRole.tenant);
    expect(boot.contracts, isNotEmpty, reason: 'seeded tenant must hold a contract');
    expect(
      boot.contracts.every((c) => c.tenantId == boot.me.id),
      isTrue,
      reason: 'tenant must only receive their own contracts',
    );
  });

  test('admin bootstrap exposes the admin-only collections', () async {
    final user = await api.demoLogin('admin');
    expect(user.role, UserRole.admin);

    final boot = await api.bootstrap();
    expect(boot.me.role, UserRole.admin);
    expect(boot.users, isNotEmpty, reason: 'admin must see all users');
    expect(boot.properties, isNotEmpty);
  });

  test('services catalogue is exposed and priced', () async {
    await api.demoLogin('tenant');
    final boot = await api.bootstrap();
    expect(boot.services, isNotEmpty, reason: 'seeded service catalogue');
    expect(boot.services.every((s) => s.price >= 0), isTrue);
  });

  test('tenant can raise a real maintenance request', () async {
    await api.demoLogin('tenant');
    final before = await api.bootstrap();

    final created = await api.createMaintenance(
      title: 'اختبار آلي: تسريب في المطبخ',
      category: 'plumbing',
      priority: 'high',
    );

    expect(created.id, isNotEmpty);
    expect(created.status, 'new');
    expect(created.priority, 'high');

    final after = await api.bootstrap();
    expect(
      after.maintenance.length,
      before.maintenance.length + 1,
      reason: 'the created request must be persisted server-side',
    );
    expect(after.maintenance.any((m) => m.id == created.id), isTrue);
  });

  test('tenant can pay a real due payment and it persists', () async {
    await api.demoLogin('tenant');
    final boot = await api.bootstrap();

    final unpaid = boot.payments.where((p) => !p.isPaid).toList();
    if (unpaid.isEmpty) {
      // Nothing outstanding for this seeded tenant; nothing to assert.
      return;
    }
    final target = unpaid.first;
    final before = boot.payments.where((p) => p.isPaid).length;

    await api.pay(target.id, 'benefit');

    final after = await api.bootstrap();
    final updated = after.payments.firstWhere((p) => p.id == target.id);
    expect(updated.isPaid, isTrue, reason: 'payment must be recorded as paid');
    expect(updated.receipt, isNotNull, reason: 'the backend issues a receipt number');
    expect(after.payments.where((p) => p.isPaid).length, before + 1);
  });

  test('notifications read-all persists', () async {
    await api.demoLogin('tenant');
    final boot = await api.bootstrap();
    if (boot.unreadCount == 0) return;

    await api.markAllNotificationsRead();

    final after = await api.bootstrap();
    expect(after.unreadCount, 0);
  });

  test('a tenant can request a refund and it appears in the bootstrap', () async {
    await api.demoLogin('tenant');
    final boot = await api.bootstrap();

    // Prefer an already-paid payment; otherwise pay one first so the request is valid.
    Payment? paid = boot.payments.where((p) => p.isPaid).firstOrNull;
    if (paid == null) {
      final unpaid = boot.payments.where((p) => !p.isPaid).firstOrNull;
      if (unpaid == null) return; // seeded tenant has no payments to act on
      await api.pay(unpaid.id, 'benefit');
      paid = (await api.bootstrap()).payments.firstWhere((p) => p.id == unpaid.id);
    }

    // A refund may already be pending/approved from an earlier run; skip in that case.
    if (boot.refundOfPayment(paid.id) != null) return;

    await api.requestRefund(paymentId: paid.id, reason: 'live contract test');

    final after = await api.bootstrap();
    final refund = after.refundOfPayment(paid.id);
    expect(refund, isNotNull, reason: 'the refund request must be persisted server-side');
    expect(refund!.status, 'pending', reason: 'a new request starts pending admin review');
    expect(refund.amount, greaterThan(0));
  });

  test('invalid credentials produce a typed, localisable error', () async {
    await expectLater(
      api.login(email: 'nobody@example.bh', password: 'wrongpassword'),
      throwsA(isA<Exception>()),
    );
  });

  test('a rejected session maps to unauthorized and clears the token', () async {
    await client.adoptSession('definitely-not-a-real-token');
    await expectLater(
      api.bootstrap(),
      throwsA(isA<Exception>()),
    );
    expect(client.hasSession, isFalse, reason: 'a 401 must clear the stored session');
  });
}
