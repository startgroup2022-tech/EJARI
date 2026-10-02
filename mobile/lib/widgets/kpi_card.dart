import 'package:flutter/material.dart';

import '../core/theme/ejari_palette.dart';

/// A single dashboard metric. Values always come from the backend snapshot.
class KpiCard extends StatelessWidget {
  const KpiCard({
    super.key,
    required this.label,
    required this.value,
    this.unit,
    this.hint,
    this.icon,
    this.tone = Tone.brand,
    this.onTap,
  });

  final String label;
  final String value;
  final String? unit;
  final String? hint;
  final IconData? icon;
  final Tone tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final (fg, bg) = p.tone(tone);
    return Material(
      color: p.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: p.line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (icon != null)
                    Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(9)),
                      child: Icon(icon, size: 16, color: fg),
                    ),
                  if (icon != null) const SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      label,
                      style: TextStyle(fontSize: 12.5, color: p.ink2, fontWeight: FontWeight.w500),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Flexible(
                    child: Text(
                      value,
                      style: TextStyle(
                        fontSize: 21,
                        fontWeight: FontWeight.w700,
                        color: p.ink,
                        height: 1.1,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (unit != null) ...[
                    const SizedBox(width: 5),
                    Text(unit!, style: TextStyle(fontSize: 12.5, color: p.ink3, fontWeight: FontWeight.w500)),
                  ],
                ],
              ),
              if (hint != null) ...[
                const SizedBox(height: 4),
                Text(
                  hint!,
                  style: TextStyle(fontSize: 11.5, color: p.ink3),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
