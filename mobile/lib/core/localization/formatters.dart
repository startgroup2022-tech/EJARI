import 'package:intl/intl.dart';

/// Date, money and label formatting shared across the app.
class Fmt {
  Fmt._();

  static const _monthsEn = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  static const _monthsAr = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  /// `25 Sep 2026` / `25 سبتمبر 2026`
  static String date(DateTime? d, String lang) {
    if (d == null) return '—';
    final months = lang == 'ar' ? _monthsAr : _monthsEn;
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }

  /// `25 Sep 2026, 14:03` / `25 سبتمبر 2026، 14:03`
  static String dateTime(DateTime? d, String lang) {
    if (d == null) return '—';
    final hm = '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    return '${date(d, lang)}, $hm';
  }

  /// Currency amount without a trailing `.0`.
  static String money(double amount, String currency) {
    final f = NumberFormat(amount == amount.roundToDouble() ? '#,##0' : '#,##0.00');
    return '${f.format(amount)} $currency';
  }

  static String number(num value) => NumberFormat('#,##0').format(value);

  /// Whole days from now until [target], clamped at zero for past dates.
  static int daysUntil(DateTime? target) {
    if (target == null) return 0;
    final days = target.difference(DateTime.now()).inDays;
    return days < 0 ? 0 : days;
  }
}
