import 'app_user.dart';
import 'contract.dart';
import 'document.dart';
import 'json_utils.dart';
import 'maintenance.dart';
import 'notification.dart';
import 'payment.dart';
import 'property.dart';
import 'service.dart';

/// The single payload returned by `GET /api/bootstrap`.
///
/// The backend scopes every collection to the authenticated role, so the client
/// never has to filter for authorisation — it only presents what it was given.
class Bootstrap {
  const Bootstrap({
    required this.me,
    this.users = const [],
    this.properties = const [],
    this.units = const [],
    this.contracts = const [],
    this.payments = const [],
    this.maintenance = const [],
    this.documents = const [],
    this.notifications = const [],
    this.services = const [],
    this.requests = const [],
    this.autopay = false,
    this.verifications = const [],
  });

  final AppUser me;
  final List<AppUser> users;
  final List<Property> properties;
  final List<Unit> units;
  final List<Contract> contracts;
  final List<Payment> payments;
  final List<MaintenanceRequest> maintenance;
  final List<AppDocument> documents;
  final List<AppNotification> notifications;
  final List<Service> services;
  final List<ServiceRequest> requests;
  final bool autopay;
  final List<Map<String, dynamic>> verifications;

  factory Bootstrap.fromJson(dynamic json) {
    final m = asMap(json);
    return Bootstrap(
      me: AppUser.fromJson(m['me']),
      users: asMapList(m['users']).map(AppUser.fromJson).toList(),
      properties: asMapList(m['properties']).map(Property.fromJson).toList(),
      units: asMapList(m['units']).map(Unit.fromJson).toList(),
      contracts: asMapList(m['contracts']).map(Contract.fromJson).toList(),
      payments: asMapList(m['payments']).map(Payment.fromJson).toList(),
      maintenance: asMapList(m['maintenance']).map(MaintenanceRequest.fromJson).toList(),
      documents: asMapList(m['documents']).map(AppDocument.fromJson).toList(),
      notifications: asMapList(m['notifications']).map(AppNotification.fromJson).toList(),
      services: asMapList(m['services']).map(Service.fromJson).toList(),
      requests: asMapList(m['requests']).map(ServiceRequest.fromJson).toList(),
      autopay: asBool(m['autopay']),
      verifications: asMapList(m['verifications']),
    );
  }

  int get unreadCount => notifications.where((n) => !n.read).length;

  AppUser? userById(String id) {
    for (final u in users) {
      if (u.id == id) return u;
    }
    if (me.id == id) return me;
    return null;
  }

  Property? propertyById(String id) {
    for (final p in properties) {
      if (p.id == id) return p;
    }
    return null;
  }

  Unit? unitById(String id) {
    for (final u in units) {
      if (u.id == id) return u;
    }
    return null;
  }

  Contract? contractById(String id) {
    for (final c in contracts) {
      if (c.id == id) return c;
    }
    return null;
  }

  Service? serviceById(String id) {
    for (final s in services) {
      if (s.id == id) return s;
    }
    return null;
  }

  /// Units that belong to a given property.
  List<Unit> unitsOf(String propertyId) =>
      units.where((u) => u.propertyId == propertyId).toList();

  /// Payments that belong to a given contract.
  List<Payment> paymentsOf(String contractId) =>
      payments.where((p) => p.contractId == contractId).toList();
}
