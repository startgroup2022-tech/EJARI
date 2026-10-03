import 'json_utils.dart';
import 'localized_text.dart';

/// A refund request as returned by `GET /api/bootstrap` (admin scope).
///
/// The backend owns the status: the client only displays what it is given and
/// never decides that a refund is approved, rejected or settled.
class Refund {
  const Refund({
    required this.id,
    required this.contractId,
    required this.amount,
    required this.reason,
    required this.status,
    this.paymentId,
  });

  final String id;
  final String contractId;
  final double amount;
  final LocalizedText reason;

  /// `pending`, `approved` or `rejected`.
  final String status;

  /// The payment this refund applies to, when the backend links one.
  final String? paymentId;

  bool get isPending => status == 'pending';
  bool get isApproved => status == 'approved';
  bool get isRejected => status == 'rejected';

  factory Refund.fromJson(dynamic json) {
    final m = asMap(json);
    final pid = m['p'];
    return Refund(
      id: asString(m['id']),
      contractId: asString(m['c']),
      amount: asDouble(m['amount']),
      reason: LocalizedText.fromJson(m['why']),
      status: asString(m['st'], 'pending'),
      paymentId: pid == null ? null : asString(pid),
    );
  }
}
