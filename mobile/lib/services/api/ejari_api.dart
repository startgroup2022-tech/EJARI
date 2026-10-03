import 'dart:typed_data';

import '../../core/errors/api_exception.dart';
import '../../core/network/api_client.dart';
import '../../models/app_user.dart';
import '../../models/bootstrap.dart';
import '../../models/maintenance.dart';
import '../../models/service.dart';

/// Typed wrapper over the existing Ejari REST API.
///
/// Every method maps to one real backend route; no endpoint is invented here.
class EjariApi {
  EjariApi(this._client);

  final ApiClient _client;

  /// Public base URL, used to build links the OS should open (receipts, contract
  /// documents) rather than fetch as JSON.
  String get baseUrl => _client.baseUrl;

  // ---------------- Auth ----------------

  /// `POST /api/auth/login`
  Future<AppUser> login({required String email, required String password}) async {
    final res = await _client.post<Map<String, dynamic>>(
      '/api/auth/login',
      body: {'email': email, 'password': password},
    );
    return AppUser.fromJson(res['user']);
  }

  /// `POST /api/auth/demo` — development convenience; the backend disables it in production.
  Future<AppUser> demoLogin(String role) async {
    final res = await _client.post<Map<String, dynamic>>('/api/auth/demo', body: {'role': role});
    return AppUser.fromJson(res['user']);
  }

  /// `GET /api/config` — the server's own answer to "is demo mode on?".
  /// Returns false on any failure so the app never advertises demo access by accident.
  Future<bool> demoEnabled() async {
    try {
      final res = await _client.get<Map<String, dynamic>>('/api/config');
      return res['demo'] == true;
    } catch (_) {
      return false;
    }
  }

  /// `POST /api/auth/logout`
  Future<void> logout() => _client.post<Map<String, dynamic>>('/api/auth/logout');

  /// `GET /api/auth/me`
  Future<AppUser?> me() async {
    final res = await _client.get<Map<String, dynamic>>('/api/auth/me');
    final user = res['user'];
    return user == null ? null : AppUser.fromJson(user);
  }

  /// `POST /api/auth/password`
  Future<void> changePassword({required String currentPassword, required String newPassword}) =>
      _client.post<Map<String, dynamic>>(
        '/api/auth/password',
        body: {'currentPassword': currentPassword, 'newPassword': newPassword},
      );

  /// `POST /api/auth/forgot-password`
  ///
  /// The backend always answers with the same generic body, so the UI must never
  /// branch on account existence — only confirm that the request was accepted.
  Future<void> forgotPassword(String email) =>
      _client.post<Map<String, dynamic>>('/api/auth/forgot-password', body: {'email': email});

  /// `GET /api/auth/reset-password/:token` — validates a reset link before showing the form.
  /// Returns `valid`, `expired` or `invalid`.
  Future<String> checkResetToken(String token) async {
    try {
      await _client.get<Map<String, dynamic>>('/api/auth/reset-password/$token');
      return 'valid';
    } on ApiException catch (e) {
      if (e.statusCode == 410) return 'expired';
      if (e.statusCode == 404) return 'invalid';
      rethrow;
    }
  }

  /// `POST /api/auth/reset-password` — sets a new password with a valid token.
  Future<void> resetPassword({required String token, required String password}) =>
      _client.post<Map<String, dynamic>>(
        '/api/auth/reset-password',
        body: {'token': token, 'password': password},
      );

  // ---------------- Bootstrap ----------------

  /// `GET /api/bootstrap` — role-scoped snapshot of everything the user may see.
  Future<Bootstrap> bootstrap() async {
    final res = await _client.get<Map<String, dynamic>>('/api/bootstrap');
    return Bootstrap.fromJson(res);
  }

  // ---------------- Maintenance ----------------

  /// `POST /api/maintenance` (tenant only; requires an active contract)
  Future<MaintenanceRequest> createMaintenance({
    required String title,
    required String category,
    required String priority,
  }) async {
    final res = await _client.post<Map<String, dynamic>>(
      '/api/maintenance',
      body: {'title': title, 'category': category, 'priority': priority},
    );
    return MaintenanceRequest.fromJson(res['request']);
  }

  /// `POST /api/maintenance/:id/rate`
  Future<void> rateMaintenance(String id, int rating) =>
      _client.post<Map<String, dynamic>>('/api/maintenance/$id/rate', body: {'rating': rating});

  // ---------------- Service requests ----------------

  /// `POST /api/service-requests`
  Future<ServiceRequest> createServiceRequest({required String serviceId, String notes = ''}) async {
    final res = await _client.post<Map<String, dynamic>>(
      '/api/service-requests',
      body: {'serviceId': serviceId, 'notes': notes},
    );
    return ServiceRequest.fromJson(res['request']);
  }

  /// `POST /api/service-requests/:id/message`
  Future<void> messageServiceRequest(String id, String note) =>
      _client.post<Map<String, dynamic>>('/api/service-requests/$id/message', body: {'note': note});

  // ---------------- Payments ----------------

  /// `GET /api/gateways/available` — the enabled gateways a payer may choose from.
  /// Returns an empty list on failure so the UI degrades to a clear message rather than crashing.
  Future<List<Map<String, dynamic>>> availableGateways() async {
    try {
      final res = await _client.get<Map<String, dynamic>>('/api/gateways/available');
      return ((res['gateways'] as List?) ?? const []).cast<Map<String, dynamic>>();
    } catch (_) {
      return const [];
    }
  }

  /// `POST /api/payments/:id/intent` — opens a real payment with the chosen gateway.
  /// Returns the intent (reference, redirect URL, status). The payment is only
  /// confirmed when the gateway's signed webhook reaches the server.
  Future<Map<String, dynamic>> createPaymentIntent(String paymentId, {String? gatewayId, String method = 'benefit'}) async {
    final res = await _client.post<Map<String, dynamic>>(
      '/api/payments/$paymentId/intent',
      body: {'gatewayId': gatewayId, 'method': method},
    );
    return (res['intent'] as Map).cast<String, dynamic>();
  }

  /// `GET /api/payments/intent/:reference` — poll an intent's current status.
  Future<Map<String, dynamic>> paymentIntent(String reference) async {
    final res = await _client.get<Map<String, dynamic>>('/api/payments/intent/$reference');
    return (res['intent'] as Map).cast<String, dynamic>();
  }

  /// `POST /api/payments/intent/:reference/verify` — ask the server to re-check the
  /// authoritative status with the provider (used after returning from a hosted page).
  Future<Map<String, dynamic>> verifyPaymentIntent(String reference) async {
    final res = await _client.post<Map<String, dynamic>>('/api/payments/intent/$reference/verify');
    return (res['intent'] as Map).cast<String, dynamic>();
  }

  /// `POST /api/payments/intent/:reference/sandbox-confirm` — only valid for the
  /// sandbox gateway; lets the test provider report its result through the same
  /// signed-webhook path a real gateway uses. Refused (403) for live gateways.
  Future<Map<String, dynamic>> sandboxConfirm(String reference, {String outcome = 'paid'}) =>
      _client.post<Map<String, dynamic>>('/api/payments/intent/$reference/sandbox-confirm', body: {'outcome': outcome});

  /// `POST /api/payments/:id/pay` — records a manual (cash) payment against the real backend.
  Future<void> pay(String paymentId, String method) =>
      _client.post<Map<String, dynamic>>('/api/payments/$paymentId/pay', body: {'method': method});

  /// `POST /api/payments/:id/remind` (landlord/admin only on the server)
  Future<void> remindPayment(String paymentId) =>
      _client.post<Map<String, dynamic>>('/api/payments/$paymentId/remind');

  // ---------------- Refunds ----------------

  /// `POST /api/refunds` — a tenant asks for a refund on a payment they made.
  /// The request is created `pending`; it only settles once an administrator approves it.
  Future<void> requestRefund({required String paymentId, String reason = ''}) =>
      _client.post<Map<String, dynamic>>(
        '/api/refunds',
        body: {
          'paymentId': paymentId,
          if (reason.trim().isNotEmpty) 'reasonAr': reason.trim(),
          if (reason.trim().isNotEmpty) 'reasonEn': reason.trim(),
        },
      );

  // ---------------- Notifications ----------------

  /// `POST /api/notifications/:id/read`
  Future<void> markNotificationRead(String id) =>
      _client.post<Map<String, dynamic>>('/api/notifications/$id/read');

  /// `POST /api/notifications/read-all`
  Future<void> markAllNotificationsRead() =>
      _client.post<Map<String, dynamic>>('/api/notifications/read-all');

  // ---------------- Documents ----------------

  /// `GET /api/documents/:id/download` — raw bytes of the stored file.
  ///
  /// The response is binary, so it bypasses JSON decoding entirely.
  Future<Uint8List> downloadDocument(String id) =>
      _client.getBytes('/api/documents/$id/download');

  /// HTML links the OS opens directly in a browser tab.
  String receiptUrl(String paymentId) => '$baseUrl/api/payments/$paymentId/receipt';
  String contractDocumentUrl(String contractId) => '$baseUrl/api/contracts/$contractId/document';
  String documentDownloadUrl(String documentId) => '$baseUrl/api/documents/$documentId/download';

  /// `GET /api/verify/:no` — public contract verification.
  Future<Map<String, dynamic>> verifyContract(String contractNo) =>
      _client.get<Map<String, dynamic>>('/api/verify/$contractNo');
}
