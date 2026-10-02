import 'dart:typed_data';

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

  /// `POST /api/payments/:id/pay` — records the payment against the real backend.
  Future<void> pay(String paymentId, String method) =>
      _client.post<Map<String, dynamic>>('/api/payments/$paymentId/pay', body: {'method': method});

  /// `POST /api/payments/:id/remind` (landlord/admin only on the server)
  Future<void> remindPayment(String paymentId) =>
      _client.post<Map<String, dynamic>>('/api/payments/$paymentId/remind');

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
