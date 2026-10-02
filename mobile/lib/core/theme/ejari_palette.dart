import 'package:flutter/material.dart';

/// Semantic tones shared by every status chip in the app.
enum Tone { neutral, info, success, warn, danger, gold, brand }

/// Ejari design tokens, ported 1:1 from `assets/css/tokens.css` so the native
/// client belongs to the same visual family as the website and the dashboard.
@immutable
class EjariPalette extends ThemeExtension<EjariPalette> {
  const EjariPalette({
    required this.bg,
    required this.surface,
    required this.surfaceAlt,
    required this.ink,
    required this.ink2,
    required this.ink3,
    required this.line,
    required this.brand,
    required this.brandSoft,
    required this.onBrand,
    required this.primary,
    required this.onPrimary,
    required this.mint,
    required this.gold,
    required this.goldSoft,
    required this.ok,
    required this.okSoft,
    required this.warn,
    required this.warnSoft,
    required this.bad,
    required this.badSoft,
    required this.info,
    required this.infoSoft,
    required this.slate,
    required this.slateSoft,
  });

  final Color bg;
  final Color surface;
  final Color surfaceAlt;
  final Color ink;
  final Color ink2;
  final Color ink3;
  final Color line;
  final Color brand;
  final Color brandSoft;
  final Color onBrand;
  final Color primary;
  final Color onPrimary;
  final Color mint;
  final Color gold;
  final Color goldSoft;
  final Color ok;
  final Color okSoft;
  final Color warn;
  final Color warnSoft;
  final Color bad;
  final Color badSoft;
  final Color info;
  final Color infoSoft;
  final Color slate;
  final Color slateSoft;

  static const light = EjariPalette(
    bg: Color(0xFFF2F5F9),
    surface: Color(0xFFFFFFFF),
    surfaceAlt: Color(0xFFF7F9FC),
    ink: Color(0xFF17253B),
    ink2: Color(0xFF4A5B74),
    ink3: Color(0xFF7D8CA1),
    line: Color(0xFFDEE4EC),
    brand: Color(0xFF0C7D63),
    brandSoft: Color(0xFFE2F5EE),
    onBrand: Color(0xFFFFFFFF),
    primary: Color(0xFF2A3B57),
    onPrimary: Color(0xFFFFFFFF),
    mint: Color(0xFF22BB94),
    gold: Color(0xFF8F6710),
    goldSoft: Color(0xFFF6EDD3),
    ok: Color(0xFF17794F),
    okSoft: Color(0xFFDFF2E8),
    warn: Color(0xFF9A5F08),
    warnSoft: Color(0xFFFBEED2),
    bad: Color(0xFFB3261E),
    badSoft: Color(0xFFFCE5E3),
    info: Color(0xFF1D5F9E),
    infoSoft: Color(0xFFE2EEF9),
    slate: Color(0xFF4A5B74),
    slateSoft: Color(0xFFE8EDF4),
  );

  static const dark = EjariPalette(
    bg: Color(0xFF0A121C),
    surface: Color(0xFF111C2A),
    surfaceAlt: Color(0xFF162434),
    ink: Color(0xFFE9EEF5),
    ink2: Color(0xFFAAB7C7),
    ink3: Color(0xFF7C8A9C),
    line: Color(0xFF243447),
    brand: Color(0xFF2FC9A0),
    brandSoft: Color(0xFF0F3A30),
    onBrand: Color(0xFF04241B),
    primary: Color(0xFFDDE7F2),
    onPrimary: Color(0xFF0B1622),
    mint: Color(0xFF34D4AA),
    gold: Color(0xFFD9AE55),
    goldSoft: Color(0xFF33290F),
    ok: Color(0xFF4CC38A),
    okSoft: Color(0xFF0F3324),
    warn: Color(0xFFE3A94B),
    warnSoft: Color(0xFF3A2A0C),
    bad: Color(0xFFFF7F75),
    badSoft: Color(0xFF3D1815),
    info: Color(0xFF6DB3F2),
    infoSoft: Color(0xFF12304A),
    slate: Color(0xFF9DB0C9),
    slateSoft: Color(0xFF1E2C3E),
  );

  /// Foreground/background pair for a semantic tone, used by status chips.
  (Color fg, Color bgColor) tone(Tone tone) => switch (tone) {
        Tone.neutral => (slate, slateSoft),
        Tone.info => (info, infoSoft),
        Tone.success => (ok, okSoft),
        Tone.warn => (warn, warnSoft),
        Tone.danger => (bad, badSoft),
        Tone.gold => (gold, goldSoft),
        Tone.brand => (brand, brandSoft),
      };

  @override
  EjariPalette copyWith({
    Color? bg,
    Color? surface,
    Color? surfaceAlt,
    Color? ink,
    Color? ink2,
    Color? ink3,
    Color? line,
    Color? brand,
    Color? brandSoft,
    Color? onBrand,
    Color? primary,
    Color? onPrimary,
    Color? mint,
    Color? gold,
    Color? goldSoft,
    Color? ok,
    Color? okSoft,
    Color? warn,
    Color? warnSoft,
    Color? bad,
    Color? badSoft,
    Color? info,
    Color? infoSoft,
    Color? slate,
    Color? slateSoft,
  }) =>
      EjariPalette(
        bg: bg ?? this.bg,
        surface: surface ?? this.surface,
        surfaceAlt: surfaceAlt ?? this.surfaceAlt,
        ink: ink ?? this.ink,
        ink2: ink2 ?? this.ink2,
        ink3: ink3 ?? this.ink3,
        line: line ?? this.line,
        brand: brand ?? this.brand,
        brandSoft: brandSoft ?? this.brandSoft,
        onBrand: onBrand ?? this.onBrand,
        primary: primary ?? this.primary,
        onPrimary: onPrimary ?? this.onPrimary,
        mint: mint ?? this.mint,
        gold: gold ?? this.gold,
        goldSoft: goldSoft ?? this.goldSoft,
        ok: ok ?? this.ok,
        okSoft: okSoft ?? this.okSoft,
        warn: warn ?? this.warn,
        warnSoft: warnSoft ?? this.warnSoft,
        bad: bad ?? this.bad,
        badSoft: badSoft ?? this.badSoft,
        info: info ?? this.info,
        infoSoft: infoSoft ?? this.infoSoft,
        slate: slate ?? this.slate,
        slateSoft: slateSoft ?? this.slateSoft,
      );

  @override
  EjariPalette lerp(ThemeExtension<EjariPalette>? other, double t) {
    if (other is! EjariPalette) return this;
    Color c(Color a, Color b) => Color.lerp(a, b, t)!;
    return EjariPalette(
      bg: c(bg, other.bg),
      surface: c(surface, other.surface),
      surfaceAlt: c(surfaceAlt, other.surfaceAlt),
      ink: c(ink, other.ink),
      ink2: c(ink2, other.ink2),
      ink3: c(ink3, other.ink3),
      line: c(line, other.line),
      brand: c(brand, other.brand),
      brandSoft: c(brandSoft, other.brandSoft),
      onBrand: c(onBrand, other.onBrand),
      primary: c(primary, other.primary),
      onPrimary: c(onPrimary, other.onPrimary),
      mint: c(mint, other.mint),
      gold: c(gold, other.gold),
      goldSoft: c(goldSoft, other.goldSoft),
      ok: c(ok, other.ok),
      okSoft: c(okSoft, other.okSoft),
      warn: c(warn, other.warn),
      warnSoft: c(warnSoft, other.warnSoft),
      bad: c(bad, other.bad),
      badSoft: c(badSoft, other.badSoft),
      info: c(info, other.info),
      infoSoft: c(infoSoft, other.infoSoft),
      slate: c(slate, other.slate),
      slateSoft: c(slateSoft, other.slateSoft),
    );
  }
}

extension EjariPaletteX on BuildContext {
  EjariPalette get palette => Theme.of(this).extension<EjariPalette>()!;
}
