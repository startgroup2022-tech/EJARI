import 'json_utils.dart';
import 'localized_text.dart';

class Property {
  const Property({
    required this.id,
    required this.owner,
    required this.name,
    required this.area,
    required this.type,
    this.deed,
    this.verified = false,
    this.dup = false,
  });

  final String id;
  final String owner;
  final LocalizedText name;
  final String area;
  final String type;
  final String? deed;
  final bool verified;
  final bool dup;

  factory Property.fromJson(dynamic json) {
    final m = asMap(json);
    return Property(
      id: asString(m['id']),
      owner: asString(m['owner']),
      name: LocalizedText.fromJson(m['name']),
      area: asString(m['area']),
      type: asString(m['type'], 'building'),
      deed: m['deed'] == null ? null : asString(m['deed']),
      verified: asBool(m['verified']),
      dup: asBool(m['dup']),
    );
  }
}

class Unit {
  const Unit({
    required this.id,
    required this.propertyId,
    required this.no,
    required this.type,
    this.beds = 0,
    this.size = 0,
    this.rent = 0,
    this.listed = false,
    this.flag,
  });

  final String id;
  final String propertyId;
  final String no;
  final String type;
  final int beds;
  final double size;
  final double rent;
  final bool listed;
  final String? flag;

  factory Unit.fromJson(dynamic json) {
    final m = asMap(json);
    return Unit(
      id: asString(m['id']),
      propertyId: asString(m['prop']),
      no: asString(m['no']),
      type: asString(m['type'], 'apt'),
      beds: asInt(m['beds']),
      size: asDouble(m['size']),
      rent: asDouble(m['rent']),
      listed: asBool(m['listed']),
      flag: m['flag'] == null ? null : asString(m['flag']),
    );
  }
}
