import 'package:flutter/material.dart';

/// The approved Ejari logo.
///
/// Mirrors the web clients' polarity convention:
///  * [onDarkBackground] = true  → white logo (`logo-dark.webp`)
///  * [onDarkBackground] = false → dark-ink logo (`logo-light.webp`)
class EjariLogo extends StatelessWidget {
  const EjariLogo({super.key, this.height = 48, this.onDarkBackground = false});

  final double height;
  final bool onDarkBackground;

  static const darkAsset = 'assets/images/logo-dark.webp';
  static const lightAsset = 'assets/images/logo-light.webp';

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      onDarkBackground ? darkAsset : lightAsset,
      height: height,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.high,
    );
  }
}
