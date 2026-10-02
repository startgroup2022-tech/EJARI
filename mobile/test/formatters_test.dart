import 'package:ejari_mobile/core/localization/formatters.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Fmt.money', () {
    test('drops trailing zeros for whole amounts', () {
      expect(Fmt.money(450, 'BD'), '450 BD');
      expect(Fmt.money(1200, 'د.ب'), '1,200 د.ب');
    });

    test('keeps two decimals for fractional amounts', () {
      expect(Fmt.money(25.5, 'BD'), '25.50 BD');
    });
  });

  group('Fmt.date', () {
    test('formats in English', () {
      expect(Fmt.date(DateTime(2026, 9, 25), 'en'), '25 Sep 2026');
    });

    test('formats in Arabic', () {
      expect(Fmt.date(DateTime(2026, 9, 25), 'ar'), '25 سبتمبر 2026');
    });

    test('renders a dash for a missing date', () {
      expect(Fmt.date(null, 'en'), '—');
    });
  });

  group('Fmt.dateTime', () {
    test('zero-pads the time', () {
      expect(Fmt.dateTime(DateTime(2026, 1, 5, 9, 7), 'en'), '5 Jan 2026, 09:07');
    });
  });

  group('Fmt.daysUntil', () {
    test('returns zero for a past date', () {
      expect(Fmt.daysUntil(DateTime.now().subtract(const Duration(days: 5))), 0);
    });

    test('counts days to a future date', () {
      expect(Fmt.daysUntil(DateTime.now().add(const Duration(days: 10))), greaterThanOrEqualTo(9));
    });
  });
}
