import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_strings.dart';
import '../../core/theme/ejari_palette.dart';
import '../../models/property.dart';
import '../../providers/auth_provider.dart';
import '../../routing/app_routes.dart';
import '../../widgets/section_card.dart';
import '../../widgets/state_views.dart';
import '../../widgets/status_chip.dart';

/// Property list for landlords and admins. Tenants have no properties, so the
/// screen shows an empty state rather than inventing anything.
class PropertiesScreen extends ConsumerWidget {
  const PropertiesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const LoadingView();

    final s = AppStrings.of(context);
    final lang = Localizations.localeOf(context).languageCode;
    final properties = auth.bootstrap.properties;

    if (properties.isEmpty) {
      return EmptyView(icon: Icons.apartment_outlined, message: s.noProperties);
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(authProvider.notifier).refresh(),
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        itemCount: properties.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, i) {
          final property = properties[i];
          final units = auth.bootstrap.unitsOf(property.id);
          return _PropertyTile(
            property: property,
            unitCount: units.length,
            listedCount: units.where((u) => u.listed).length,
            lang: lang,
            s: s,
          );
        },
      ),
    );
  }
}

class _PropertyTile extends StatelessWidget {
  const _PropertyTile({
    required this.property,
    required this.unitCount,
    required this.listedCount,
    required this.lang,
    required this.s,
  });

  final Property property;
  final int unitCount;
  final int listedCount;
  final String lang;
  final AppStrings s;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return SectionCard(
      onTap: () => Navigator.of(context).pushNamed(AppRoutes.propertyDetail, arguments: property),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(color: p.brandSoft, borderRadius: BorderRadius.circular(12)),
                child: Icon(Icons.apartment_rounded, size: 21, color: p.brand),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      property.name.forLang(lang),
                      style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: p.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      property.deed == null ? '—' : '${s.deed}: ${property.deed}',
                      style: TextStyle(fontSize: 12.5, color: p.ink3),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_left_rounded, color: p.ink3),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              StatusChip(
                label: property.verified ? s.verified : s.unverified,
                tone: property.verified ? Tone.success : Tone.warn,
                icon: property.verified ? Icons.verified_rounded : Icons.pending_outlined,
              ),
              StatusChip(
                label: '$unitCount ${s.units}',
                tone: Tone.info,
                icon: Icons.meeting_room_outlined,
              ),
              if (listedCount > 0)
                StatusChip(label: '$listedCount ${s.listed}', tone: Tone.brand, icon: Icons.campaign_outlined),
            ],
          ),
        ],
      ),
    );
  }
}
