import 'json_utils.dart';
import 'localized_text.dart';

enum UserRole {
  landlord,
  tenant,
  admin;

  static UserRole from(String? raw) => switch (raw) {
        'landlord' => UserRole.landlord,
        'admin' => UserRole.admin,
        _ => UserRole.tenant,
      };

  String get apiValue => name;
}

class AppUser {
  const AppUser({
    required this.id,
    required this.role,
    required this.name,
    required this.email,
    this.sub,
    this.cpr,
    this.phone,
    this.status = 'active',
    this.verified = false,
    this.joined,
  });

  final String id;
  final UserRole role;
  final LocalizedText name;
  final String email;
  final String? sub;
  final String? cpr;
  final String? phone;
  final String status;
  final bool verified;
  final DateTime? joined;

  bool get isAdmin => role == UserRole.admin;
  bool get isLandlord => role == UserRole.landlord;
  bool get isTenant => role == UserRole.tenant;

  factory AppUser.fromJson(dynamic json) {
    final m = asMap(json);
    return AppUser(
      id: asString(m['id']),
      role: UserRole.from(asString(m['role'])),
      name: LocalizedText.fromJson(m['name']),
      email: asString(m['email']),
      sub: m['sub'] == null ? null : asString(m['sub']),
      cpr: m['cpr'] == null ? null : asString(m['cpr']),
      phone: m['phone'] == null ? null : asString(m['phone']),
      status: asString(m['status'], 'active'),
      verified: asBool(m['verified']),
      joined: m['joined'] == null ? null : DateTime.tryParse(asString(m['joined'])),
    );
  }
}
