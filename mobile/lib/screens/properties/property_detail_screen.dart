import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_strings.dart';
import '../../core/localization/formatters.dart';
import '../../core/theme/ejari_palette.dart';
import '../../models/property.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/section_card.dart';
import '../../widgets/state_views.dart';
import '../../widgets/status_chip.dart';

/// A property and its units, read from the role-scoped bootstrap snapshot.
class PropertyDetailScreen extends ConsumerWidget {
  const PropertyDetailScreen({super.key, required this.property});

  final Property property;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;

    if (auth is! AuthSignedIn) return const LoadingView();
    final units = auth.bootstrap.unitsOf(property.id);

    return Scaffold(
      appBar: AppBar(title: Text(property.name.forLang(lang))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          SectionCard(
            child: Column(
              children: [
                _Row(label: s.deed, value: property.deed ?? '—'),
                _Row(label: s.type, value: property.type),
                _Row(label: s.area, value: property.area),
                _Row(
                  label: s.status,
                  trailing: StatusChip(
                    label: property.verified ? s.verified : s.unverified,
                    tone: property.verified ? Tone.success : Tone.warn,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Text(
                s.units,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.ink),
              ),
              const SizedBox(width: 8),
              StatusChip(label: '${units.length}', tone: Tone.info),
            ],
          ),
          const SizedBox(height: 10),
          if (units.isEmpty)
            SectionCard(
              child: Row(
                children: [
                  Icon(Icons.meeting_room_outlined, size: 20, color: p.ink3),
                  const SizedBox(width: 10),
                  Expanded(child: Text(s.noUnits, style: TextStyle(fontSize: 13.5, color: p.ink2))),
                ],
              ),
            )
          else
            for (final unit in units) ...[
              _UnitTile(unit: unit, s: s),
              const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }
}

class _UnitTile extends StatelessWidget {
  const _UnitTile({required this.unit, required this.s});

  final Unit unit;
  final AppStrings s;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(color: p.surfaceAlt, borderRadius: BorderRadius.circular(10)),
                child: Icon(Icons.meeting_room_rounded, size: 19, color: p.ink2),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Text(
                  '${s.unit} ${unit.no}',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: p.ink),
                ),
              ),
              Text(
                Fmt.money(unit.rent, s.currency),
                style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: p.brand),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (unit.beds > 0)
                StatusChip(label: '${unit.beds} ${s.bedrooms}', tone: Tone.neutral, icon: Icons.bed_outlined),
              if (unit.size > 0)
                StatusChip(label: '${Fmt.number(unit.size)} ${s.sizeSqm}', tone: Tone.neutral, icon: Icons.square_foot_rounded),
              StatusChip(
                label: unit.listed ? s.listed : s.notListed,
                tone: unit.listed ? Tone.brand : Tone.neutral,
                icon: unit.listed ? Icons.campaign_outlined : Icons.visibility_off_outlined,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, this.value, this.trailing});

  final String label;
  final String? value;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Text(label, style: TextStyle(fontSize: 13.5, color: p.ink2)),
          const Spacer(),
          if (trailing != null)
            trailing!
          else
            Flexible(
              child: Text(
                value ?? '—',
                textAlign: TextAlign.end,
                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: p.ink),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
        ],
      ),
    );
  }
}
