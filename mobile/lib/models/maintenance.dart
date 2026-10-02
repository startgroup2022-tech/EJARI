import 'json_utils.dart';
import 'localized_text.dart';

class MaintenanceRequest {
  const MaintenanceRequest({
    required this.id,
    required this.unitId,
    required this.byUserId,
    required this.title,
    required this.category,
    required this.priority,
    required this.status,
    this.technician,
    this.rating = 0,
    this.created,
  });

  final String id;
  final String unitId;
  final String byUserId;
  final LocalizedText title;
  final String category;
  final String priority;

  /// `new`, `in_progress`, `done`
  final String status;
  final String? technician;
  final int rating;
  final DateTime? created;

  factory MaintenanceRequest.fromJson(dynamic json) {
    final m = asMap(json);
    return MaintenanceRequest(
      id: asString(m['id']),
      unitId: asString(m['unit']),
      byUserId: asString(m['by']),
      title: LocalizedText.fromJson(m['title']),
      category: asString(m['cat'], 'other'),
      priority: asString(m['pri'], 'normal'),
      status: asString(m['st'], 'new'),
      technician: m['tech'] == null ? null : asString(m['tech']),
      rating: asInt(m['rating']),
      created: m['created'] == null ? null : DateTime.tryParse(asString(m['created'])),
    );
  }
}
