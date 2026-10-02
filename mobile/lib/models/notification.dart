import 'json_utils.dart';
import 'localized_text.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.text,
    required this.read,
    this.subtitle,
    this.createdAt,
  });

  final String id;
  final String type;
  final LocalizedText text;
  final bool read;
  final LocalizedText? subtitle;
  final DateTime? createdAt;

  factory AppNotification.fromJson(dynamic json) {
    final m = asMap(json);
    final sub = m['sub'];
    return AppNotification(
      id: asString(m['id']),
      type: asString(m['ty'], 'sys'),
      text: LocalizedText(ar: asString(m['ar']), en: asString(m['en'])),
      read: asBool(m['read']),
      subtitle: sub == null ? null : LocalizedText.fromJson(sub),
      createdAt: m['t'] == null ? null : DateTime.tryParse(asString(m['t'])),
    );
  }
}
