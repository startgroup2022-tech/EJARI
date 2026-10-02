import 'json_utils.dart';

class AppDocument {
  const AppDocument({
    required this.id,
    required this.ownerId,
    required this.name,
    required this.type,
    this.contractId,
    this.size = '',
    this.date,
    this.dataUrl,
  });

  final String id;
  final String ownerId;
  final String name;
  final String type;
  final String? contractId;
  final String size;
  final DateTime? date;

  /// Inline data URL when the backend stores the file; null means metadata only.
  final String? dataUrl;

  bool get hasFile => dataUrl != null && dataUrl!.isNotEmpty;

  factory AppDocument.fromJson(dynamic json) {
    final m = asMap(json);
    return AppDocument(
      id: asString(m['id']),
      ownerId: asString(m['owner']),
      name: asString(m['name']),
      type: asString(m['type'], 'other'),
      contractId: m['c'] == null ? null : asString(m['c']),
      size: asString(m['size']),
      date: m['date'] == null ? null : DateTime.tryParse(asString(m['date'])),
      dataUrl: m['dataUrl'] == null ? null : asString(m['dataUrl']),
    );
  }
}
