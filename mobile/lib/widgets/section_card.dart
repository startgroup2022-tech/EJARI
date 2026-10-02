import 'package:flutter/material.dart';

import '../core/theme/ejari_palette.dart';

/// The standard Ejari surface: rounded, hairline border, no shadow.
class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.child, this.padding, this.onTap});

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final content = Padding(
      padding: padding ?? const EdgeInsets.all(16),
      child: child,
    );
    return Material(
      color: p.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: p.line),
          ),
          child: content,
        ),
      ),
    );
  }
}
