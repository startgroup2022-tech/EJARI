import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_strings.dart';
import '../../core/localization/domain_labels.dart';
import '../../core/localization/formatters.dart';
import '../../core/theme/ejari_palette.dart';
import '../../models/maintenance.dart';
import '../../providers/auth_provider.dart';
import '../../routing/app_routes.dart';
import '../../widgets/section_card.dart';
import '../../widgets/state_views.dart';
import '../../widgets/status_chip.dart';

/// Maintenance list. Tenants see the requests they raised; landlords and admins
/// see every request the backend scoped to them.
class MaintenanceTab extends ConsumerWidget {
  const MaintenanceTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const LoadingView();

    final s = AppStrings.of(context);
    final lang = Localizations.localeOf(context).languageCode;
    final requests = auth.bootstrap.maintenance;
    final canCreate = auth.user.isTenant;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => ref.read(authProvider.notifier).refresh(),
        child: requests.isEmpty
            ? ListView(
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.16),
                  EmptyView(
                    icon: Icons.build_outlined,
                    message: s.noMaintenance,
                    action: canCreate
                        ? FilledButton.icon(
                            onPressed: () =>
                                Navigator.of(context).pushNamed(AppRoutes.maintenanceNew),
                            icon: const Icon(Icons.add_rounded, size: 19),
                            label: Text(s.newRequest),
                          )
                        : null,
                  ),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                itemCount: requests.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) => _MaintenanceTile(
                  request: requests[i],
                  boot: auth.bootstrap,
                  s: s,
                  lang: lang,
                ),
              ),
      ),
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              onPressed: () => Navigator.of(context).pushNamed(AppRoutes.maintenanceNew),
              icon: const Icon(Icons.add_rounded),
              label: Text(s.newRequest),
            )
          : null,
    );
  }
}

class _MaintenanceTile extends StatelessWidget {
  const _MaintenanceTile({
    required this.request,
    required this.boot,
    required this.s,
    required this.lang,
  });

  final MaintenanceRequest request;
  final dynamic boot;
  final AppStrings s;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final (statusLabel, statusTone) = DomainLabels.maintenance(request.status, s);
    final unit = boot.unitById(request.unitId);
    final property = unit == null ? null : boot.propertyById(unit.propertyId);

    return SectionCard(
      onTap: () => Navigator.of(context).pushNamed(
        AppRoutes.maintenanceDetail,
        arguments: request,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  request.title.forLang(lang),
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.ink),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              StatusChip(label: statusLabel, tone: statusTone),
            ],
          ),
          if (property != null) ...[
            const SizedBox(height: 7),
            Row(
              children: [
                Icon(Icons.apartment_rounded, size: 15, color: p.ink3),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    unit == null
                        ? property.name.forLang(lang)
                        : '${property.name.forLang(lang)} · ${s.unit} ${unit.no}',
                    style: TextStyle(fontSize: 12.5, color: p.ink2),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 11),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              StatusChip(
                label: DomainLabels.priority(request.priority, s),
                tone: DomainLabels.priorityTone(request.priority),
                icon: Icons.flag_outlined,
              ),
              if (request.technician != null && request.technician!.isNotEmpty)
                StatusChip(
                  label: '${s.technician}: ${request.technician}',
                  tone: Tone.info,
                  icon: Icons.handyman_outlined,
                ),
              if (request.rating > 0)
                StatusChip(
                  label: '${request.rating}/5',
                  tone: Tone.gold,
                  icon: Icons.star_rounded,
                ),
              StatusChip(
                label: Fmt.date(request.created, lang),
                tone: Tone.neutral,
                icon: Icons.event_outlined,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
