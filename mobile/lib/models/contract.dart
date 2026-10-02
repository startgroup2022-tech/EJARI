import 'json_utils.dart';

class ContractChecklist {
  const ContractChecklist({
    this.keys = false,
    this.meters = false,
    this.photos = false,
    this.inventory = false,
  });

  final bool keys;
  final bool meters;
  final bool photos;
  final bool inventory;

  int get completed => [keys, meters, photos, inventory].where((e) => e).length;

  factory ContractChecklist.fromJson(dynamic json) {
    final m = asMap(json);
    return ContractChecklist(
      keys: asBool(m['keys']),
      meters: asBool(m['meters']),
      photos: asBool(m['photos']),
      inventory: asBool(m['inv']),
    );
  }
}

class Contract {
  const Contract({
    required this.id,
    required this.no,
    required this.unitId,
    required this.landlordId,
    required this.tenantId,
    required this.start,
    required this.months,
    required this.rent,
    required this.deposit,
    required this.dueDay,
    required this.freq,
    this.utilities = false,
    this.status = 'active',
    this.signedLandlord = false,
    this.signedTenant = false,
    this.notes = '',
    this.flag,
    this.checklist = const ContractChecklist(),
    this.created,
  });

  final String id;
  final String no;
  final String unitId;
  final String landlordId;
  final String tenantId;
  final DateTime? start;
  final int months;
  final double rent;
  final double deposit;
  final int dueDay;
  final String freq;
  final bool utilities;
  final String status;
  final bool signedLandlord;
  final bool signedTenant;
  final String notes;
  final String? flag;
  final ContractChecklist checklist;
  final DateTime? created;

  /// Derived end date, matching the backend's `start + months - 1 day`.
  DateTime? get end => start == null ? null : DateTime(start!.year, start!.month + months, start!.day).subtract(const Duration(days: 1));

  factory Contract.fromJson(dynamic json) {
    final m = asMap(json);
    return Contract(
      id: asString(m['id']),
      no: asString(m['no']),
      unitId: asString(m['unit']),
      landlordId: asString(m['landlord']),
      tenantId: asString(m['tenant']),
      start: m['start'] == null ? null : DateTime.tryParse(asString(m['start'])),
      months: asInt(m['months']),
      rent: asDouble(m['rent']),
      deposit: asDouble(m['deposit']),
      dueDay: asInt(m['dueDay']),
      freq: asString(m['freq'], 'monthly'),
      utilities: asBool(m['utilities']),
      status: asString(m['status'], 'active'),
      signedLandlord: asBool(m['signedL']),
      signedTenant: asBool(m['signedT']),
      notes: asString(m['notes']),
      flag: m['flag'] == null ? null : asString(m['flag']),
      checklist: ContractChecklist.fromJson(m['check']),
      created: m['created'] == null ? null : DateTime.tryParse(asString(m['created'])),
    );
  }
}
