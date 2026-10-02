import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_strings.dart';
import '../../core/localization/domain_labels.dart';
import '../../core/localization/formatters.dart';
import '../../core/theme/ejari_palette.dart';
import '../../providers/auth_provider.dart';
import '../../routing/app_routes.dart';
import '../../widgets/section_card.dart';
import '../../widgets/state_views.dart';
import '../../widgets/status_chip.dart';

/// The user's own service requests, with their server-recorded timeline.
class RequestsScreen extends ConsumerWidget {
  const RequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const LoadingView();

    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;
    final requests = auth.bootstrap.requests;

    return Scaffold(
      appBar: AppBar(title: Text(s.myRequests)),
      body: RefreshIndicator(
        onRefresh: () => ref.read(authProvider.notifier).refresh(),
        child: requests.isEmpty
            ? ListView(
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.18),
                  EmptyView(
                    icon: Icons.assignment_outlined,
                    message: s.noRequests,
                    action: FilledButton.icon(
                      onPressed: () => Navigator.of(context).pushNamed(AppRoutes.services),
                      icon: const Icon(Icons.room_service_outlined, size: 19),
                      label: Text(s.services),
                    ),
                  ),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                itemCount: requests.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  final request = requests[i];
                  final service = auth.bootstrap.serviceById(request.serviceId);
                  final (statusLabel, statusTone) = DomainLabels.request(request.status, s);
                  return SectionCard(
                    onTap: () => Navigator.of(context).pushNamed(
                      AppRoutes.requestDetail,
                      arguments: request,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                request.no,
                                style: TextStyle(
                                  fontSize: 14.5,
                                  fontWeight: FontWeight.w700,
                                  color: p.ink,
                                ),
                              ),
                            ),
                            StatusChip(label: statusLabel, tone: statusTone),
                          ],
                        ),
                        const SizedBox(height: 8),
                        if (service != null)
                          Text(
                            service.name.forLang(lang),
                            style: TextStyle(fontSize: 13.5, color: p.ink2),
                          ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            StatusChip(
                              label: Fmt.money(request.amount, s.currency),
                              tone: Tone.brand,
                              icon: Icons.sell_outlined,
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
                },
              ),
      ),
    );
  }
}
