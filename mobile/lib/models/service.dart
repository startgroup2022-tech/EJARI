import 'json_utils.dart';
import 'localized_text.dart';

class Service {
  const Service({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    this.currency = 'BHD',
    this.duration = 0,
    this.active = true,
    this.icon = 'tag',
  });

  final String id;
  final LocalizedText name;
  final LocalizedText description;
  final double price;
  final String currency;
  final int duration;
  final bool active;
  final String icon;

  factory Service.fromJson(dynamic json) {
    final m = asMap(json);
    return Service(
      id: asString(m['id']),
      name: LocalizedText.fromJson(m['name']),
      description: LocalizedText.fromJson(m['desc']),
      price: asDouble(m['price']),
      currency: asString(m['currency'], 'BHD'),
      duration: asInt(m['duration']),
      active: asBool(m['active'], true),
      icon: asString(m['icon'], 'tag'),
    );
  }
}

class RequestEvent {
  const RequestEvent({
    required this.id,
    required this.byUserId,
    required this.kind,
    required this.note,
    this.at,
  });

  final String id;
  final String byUserId;
  final String kind;
  final String note;
  final DateTime? at;

  factory RequestEvent.fromJson(dynamic json) {
    final m = asMap(json);
    return RequestEvent(
      id: asString(m['id']),
      byUserId: asString(m['from']),
      kind: asString(m['kind']),
      note: asString(m['note']),
      at: m['t'] == null ? null : DateTime.tryParse(asString(m['t'])),
    );
  }
}

class ServiceRequest {
  const ServiceRequest({
    required this.id,
    required this.no,
    required this.serviceId,
    required this.userId,
    required this.status,
    required this.amount,
    this.providerId,
    this.notes = '',
    this.scheduledAt,
    this.completedAt,
    this.created,
    this.updated,
    this.events = const [],
  });

  final String id;
  final String no;
  final String serviceId;
  final String userId;
  final String? providerId;
  final String status;
  final double amount;
  final String notes;
  final DateTime? scheduledAt;
  final DateTime? completedAt;
  final DateTime? created;
  final DateTime? updated;
  final List<RequestEvent> events;

  factory ServiceRequest.fromJson(dynamic json) {
    final m = asMap(json);
    return ServiceRequest(
      id: asString(m['id']),
      no: asString(m['no']),
      serviceId: asString(m['service']),
      userId: asString(m['user']),
      providerId: m['provider'] == null ? null : asString(m['provider']),
      status: asString(m['status'], 'new'),
      amount: asDouble(m['amount']),
      notes: asString(m['notes']),
      scheduledAt: m['scheduledAt'] == null ? null : DateTime.tryParse(asString(m['scheduledAt'])),
      completedAt: m['completedAt'] == null ? null : DateTime.tryParse(asString(m['completedAt'])),
      created: m['created'] == null ? null : DateTime.tryParse(asString(m['created'])),
      updated: m['updated'] == null ? null : DateTime.tryParse(asString(m['updated'])),
      events: asMapList(m['events']).map(RequestEvent.fromJson).toList(),
    );
  }
}
