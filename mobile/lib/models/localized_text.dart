import 'json_utils.dart';

/// A bilingual value as returned by the backend (`{ "ar": "...", "en": "..." }`).
class LocalizedText {
  const LocalizedText({required this.ar, required this.en});

  final String ar;
  final String en;

  factory LocalizedText.fromJson(dynamic json) {
    final m = asMap(json);
    return LocalizedText(ar: asString(m['ar']), en: asString(m['en']));
  }

  /// Falls back to the other language so a card is never blank.
  String forLang(String languageCode) {
    if (languageCode == 'ar') return ar.isNotEmpty ? ar : en;
    return en.isNotEmpty ? en : ar;
  }

  @override
  String toString() => en.isNotEmpty ? en : ar;
}
