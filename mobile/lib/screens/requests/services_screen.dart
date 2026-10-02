import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_strings.dart';
import '../../core/localization/formatters.dart';
import '../../core/theme/ejari_palette.dart';
import '../../providers/auth_provider.dart';
import '../../routing/app_routes.dart';
import '../../widgets/section_card.dart';
import '../../widgets/state_views.dart';

/// The service catalogue, read from `GET /api/services` via the bootstrap payload.
class ServicesScreen extends ConsumerWidget {
  const ServicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const LoadingView();

    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;
    final services = auth.bootstrap.services.where((x) => x.active).toList();

    return Scaffold(
      appBar: AppBar(title: Text(s.services)),
      body: services.isEmpty
          ? EmptyView(icon: Icons.room_service_outlined, message: s.noServices)
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              itemCount: services.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final service = services[i];
                return SectionCard(
                  onTap: () => Navigator.of(context).pushNamed(
                    AppRoutes.serviceDetail,
                    arguments: service,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 42,
                            height: 42,
                            decoration: BoxDecoration(
                              color: p.brandSoft,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(_iconFor(service.icon), size: 21, color: p.brand),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  service.name.forLang(lang),
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    color: p.ink,
                                  ),
                                ),
                                if (service.duration > 0) ...[
                                  const SizedBox(height: 3),
                                  Text(
                                    '${service.duration} ${s.minutes}',
                                    style: TextStyle(fontSize: 12, color: p.ink3),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          Text(
                            Fmt.money(service.price, s.currency),
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: p.brand,
                            ),
                          ),
                        ],
                      ),
                      if (service.description.forLang(lang).isNotEmpty) ...[
                        const SizedBox(height: 11),
                        Text(
                          service.description.forLang(lang),
                          style: TextStyle(fontSize: 13, color: p.ink2, height: 1.6),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 11),
                      Row(
                        children: [
                          Icon(Icons.chevron_left_rounded, size: 18, color: p.ink3),
                          const SizedBox(width: 4),
                          Text(
                            s.requestService,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: p.brand,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
    );
  }

  IconData _iconFor(String icon) => switch (icon) {
        'wrench' => Icons.handyman_outlined,
        'bolt' => Icons.bolt_outlined,
        'drop' => Icons.water_drop_outlined,
        'home' => Icons.home_outlined,
        'shield' => Icons.shield_outlined,
        _ => Icons.room_service_outlined,
      };
}
