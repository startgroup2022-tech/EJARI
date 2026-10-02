import 'json_utils.dart';

class Payment {
  const Payment({
    required this.id,
    required this.contractId,
    required this.kind,
    required this.due,
    required this.amount,
    required this.status,
    this.paidOn,
    this.method,
    this.receipt,
  });

  final String id;
  final String contractId;

  /// `rent`, `fee`, `deposit`, …
  final String kind;
  final DateTime? due;
  final double amount;

  /// `paid`, `due`, `overdue`, `upcoming`
  final String status;
  final DateTime? paidOn;
  final String? method;
  final String? receipt;

  bool get isPaid => status == 'paid';
  bool get isOverdue => status == 'overdue';
  bool get isFee => kind == 'fee';

  factory Payment.fromJson(dynamic json) {
    final m = asMap(json);
    return Payment(
      id: asString(m['id']),
      contractId: asString(m['c']),
      kind: asString(m['kind'], 'rent'),
      due: m['due'] == null ? null : DateTime.tryParse(asString(m['due'])),
      amount: asDouble(m['amount']),
      status: asString(m['status'], 'due'),
      paidOn: m['paidOn'] == null ? null : DateTime.tryParse(asString(m['paidOn'])),
      method: m['method'] == null ? null : asString(m['method']),
      receipt: m['receipt'] == null ? null : asString(m['receipt']),
    );
  }
}
