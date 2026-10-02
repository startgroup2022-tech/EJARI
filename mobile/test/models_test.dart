import 'package:ejari_mobile/models/app_user.dart';
import 'package:ejari_mobile/models/bootstrap.dart';
import 'package:ejari_mobile/models/contract.dart';
import 'package:ejari_mobile/models/localized_text.dart';
import 'package:ejari_mobile/models/notification.dart';
import 'package:ejari_mobile/models/payment.dart';
import 'package:ejari_mobile/models/service.dart';
import 'package:flutter_test/flutter_test.dart';

/// Payload shapes below are taken verbatim from the running Ejari backend
/// (`/api/bootstrap`, `/api/auth/login`) so the tests fail if the contract drifts.
void main() {
  group('LocalizedText', () {
    test('reads both languages', () {
      final t = LocalizedText.fromJson({'ar': 'فيلا', 'en': 'Villa'});
      expect(t.forLang('ar'), 'فيلا');
      expect(t.forLang('en'), 'Villa');
    });

    test('falls back to the other language rather than showing nothing', () {
      expect(const LocalizedText(ar: 'فيلا', en: '').forLang('en'), 'فيلا');
      expect(const LocalizedText(ar: '', en: 'Villa').forLang('ar'), 'Villa');
    });

    test('tolerates a missing object', () {
      final t = LocalizedText.fromJson(null);
      expect(t.ar, '');
      expect(t.en, '');
    });
  });

  group('AppUser', () {
    test('parses the real user shape', () {
      final user = AppUser.fromJson({
        'id': '7',
        'role': 'landlord',
        'name': {'ar': 'راشد المانعي', 'en': 'Rashed Almanai'},
        'cpr': '880123456',
        'phone': '39000000',
        'email': 'rashed.almanai@example.bh',
        'status': 'active',
        'verified': true,
        'joined': '2024-03-11T08:00:00.000Z',
      });

      expect(user.id, '7');
      expect(user.role, UserRole.landlord);
      expect(user.isLandlord, isTrue);
      expect(user.isAdmin, isFalse);
      expect(user.name.forLang('ar'), 'راشد المانعي');
      expect(user.verified, isTrue);
      expect(user.joined?.year, 2024);
    });

    test('unknown roles degrade to tenant rather than throwing', () {
      expect(UserRole.from('something_new'), UserRole.tenant);
      expect(UserRole.from(null), UserRole.tenant);
    });

    test('admin role is recognised', () {
      final user = AppUser.fromJson({'id': '1', 'role': 'admin', 'name': {}});
      expect(user.isAdmin, isTrue);
    });
  });

  group('Payment', () {
    test('parses the compact bootstrap shape', () {
      final p = Payment.fromJson({
        'id': '134',
        'c': '15',
        'kind': 'rent',
        'due': '2026-09-01',
        'amount': 450,
        'status': 'overdue',
        'paidOn': null,
        'method': null,
        'receipt': null,
      });

      expect(p.id, '134');
      expect(p.contractId, '15');
      expect(p.isOverdue, isTrue);
      expect(p.isPaid, isFalse);
      expect(p.isFee, isFalse);
      expect(p.amount, 450.0);
      expect(p.due?.month, 9);
    });

    test('detects fee payments', () {
      final p = Payment.fromJson({'id': '1', 'c': '2', 'kind': 'fee', 'status': 'due'});
      expect(p.isFee, isTrue);
    });
  });

  group('Contract', () {
    test('parses terms and the handover checklist', () {
      final c = Contract.fromJson({
        'id': '15',
        'no': 'CN-2026-0015',
        'unit': '9',
        'landlord': '7',
        'tenant': '12',
        'start': '2026-01-01',
        'months': 12,
        'rent': 450,
        'deposit': 450,
        'dueDay': 1,
        'freq': 'monthly',
        'utilities': true,
        'status': 'active',
        'signedL': true,
        'signedT': true,
        'check': {'keys': true, 'meters': true, 'photos': false, 'inv': false},
      });

      expect(c.no, 'CN-2026-0015');
      expect(c.rent, 450.0);
      expect(c.utilities, isTrue);
      expect(c.signedLandlord, isTrue);
      expect(c.checklist.completed, 2);
    });

    test('derives the end date as start + months - 1 day', () {
      final c = Contract.fromJson({
        'id': '1',
        'start': '2026-01-01',
        'months': 12,
      });
      expect(c.end, DateTime(2026, 12, 31));
    });

    test('end date is null when the start date is absent', () {
      expect(Contract.fromJson({'id': '1'}).end, isNull);
    });
  });

  group('AppNotification', () {
    test('parses the compact shape and its read flag', () {
      final n = AppNotification.fromJson({
        'id': '5',
        'ty': 'pay',
        'ar': 'تم استلام إيجار',
        'en': 'Rent received',
        'sub': {'ar': '450 د.ب', 'en': 'BD 450'},
        'read': false,
        't': '2026-09-30T10:00:00.000Z',
      });

      expect(n.type, 'pay');
      expect(n.read, isFalse);
      expect(n.text.forLang('ar'), 'تم استلام إيجار');
      expect(n.subtitle?.forLang('en'), 'BD 450');
      expect(n.createdAt?.year, 2026);
    });
  });

  group('ServiceRequest', () {
    test('parses the timeline events', () {
      final r = ServiceRequest.fromJson({
        'id': '3',
        'no': 'SR-0003',
        'service': '2',
        'user': '12',
        'status': 'assigned',
        'amount': 25,
        'notes': 'صباحاً',
        'events': [
          {'id': '1', 'from': '12', 'kind': 'created', 'note': 'تم إنشاء الطلب', 't': '2026-09-20T07:00:00.000Z'},
        ],
      });

      expect(r.no, 'SR-0003');
      expect(r.status, 'assigned');
      expect(r.amount, 25.0);
      expect(r.events, hasLength(1));
      expect(r.events.first.note, 'تم إنشاء الطلب');
    });
  });

  group('Bootstrap', () {
    late Bootstrap boot;

    setUp(() {
      boot = Bootstrap.fromJson({
        'me': {
          'id': '7',
          'role': 'landlord',
          'name': {'ar': 'راشد', 'en': 'Rashed'},
          'email': 'rashed.almanai@example.bh',
        },
        'users': [
          {'id': '12', 'role': 'tenant', 'name': {'ar': 'سارة', 'en': 'Sara'}, 'email': 'sara.aldosari@example.bh'},
        ],
        'properties': [
          {'id': '1', 'owner': '7', 'name': {'ar': 'مجمع السيف', 'en': 'Seef Complex'}, 'area': 'المنامة', 'type': 'building', 'verified': true},
        ],
        'units': [
          {'id': '9', 'prop': '1', 'no': '101', 'type': 'apt', 'beds': 2, 'size': 110, 'rent': 450, 'listed': true},
        ],
        'contracts': [
          {'id': '15', 'no': 'CN-15', 'unit': '9', 'landlord': '7', 'tenant': '12', 'rent': 450, 'status': 'active', 'months': 12},
        ],
        'payments': [
          {'id': '1', 'c': '15', 'kind': 'rent', 'amount': 450, 'status': 'paid', 'paidOn': '2026-09-01'},
          {'id': '2', 'c': '15', 'kind': 'rent', 'amount': 450, 'status': 'overdue'},
        ],
        'maintenance': [
          {'id': '1', 'unit': '9', 'by': '12', 'title': {'ar': 'تسريب', 'en': 'Leak'}, 'cat': 'plumbing', 'pri': 'high', 'st': 'new'},
        ],
        'documents': [
          {'id': '1', 'owner': '12', 'name': 'إيصال.pdf', 'type': 'receipt', 'date': '2026-09-01'},
        ],
        'notifications': [
          {'id': '1', 'ty': 'pay', 'ar': 'دفعة', 'en': 'Payment', 'read': false, 't': '2026-09-30T10:00:00.000Z'},
          {'id': '2', 'ty': 'sys', 'ar': 'نظام', 'en': 'System', 'read': true, 't': '2026-09-29T10:00:00.000Z'},
        ],
        'services': [
          {'id': '2', 'name': {'ar': 'تكييف', 'en': 'AC service'}, 'desc': {'ar': 'صيانة', 'en': 'Maintenance'}, 'price': 25, 'duration': 60, 'active': true},
        ],
        'requests': [],
        'autopay': false,
      });
    });

    test('parses every collection', () {
      expect(boot.me.id, '7');
      expect(boot.users, hasLength(1));
      expect(boot.properties, hasLength(1));
      expect(boot.units, hasLength(1));
      expect(boot.contracts, hasLength(1));
      expect(boot.payments, hasLength(2));
      expect(boot.maintenance, hasLength(1));
      expect(boot.documents, hasLength(1));
      expect(boot.notifications, hasLength(2));
      expect(boot.services, hasLength(1));
      expect(boot.autopay, isFalse);
    });

    test('counts unread notifications', () {
      expect(boot.unreadCount, 1);
    });

    test('looks entities up by id and resolves the signed-in user', () {
      expect(boot.propertyById('1')?.area, 'المنامة');
      expect(boot.unitById('9')?.no, '101');
      expect(boot.contractById('15')?.no, 'CN-15');
      expect(boot.serviceById('2')?.price, 25.0);
      expect(boot.userById('7')?.id, '7');
      expect(boot.userById('12')?.name.forLang('ar'), 'سارة');
      expect(boot.userById('999'), isNull);
    });

    test('groups units and payments by their parent', () {
      expect(boot.unitsOf('1'), hasLength(1));
      expect(boot.unitsOf('99'), isEmpty);
      expect(boot.paymentsOf('15'), hasLength(2));
      expect(boot.paymentsOf('99'), isEmpty);
    });

    test('an empty payload produces empty collections, not nulls', () {
      final empty = Bootstrap.fromJson({
        'me': {'id': '1', 'role': 'tenant', 'name': {}},
      });
      expect(empty.properties, isEmpty);
      expect(empty.payments, isEmpty);
      expect(empty.unreadCount, 0);
    });
  });
}
