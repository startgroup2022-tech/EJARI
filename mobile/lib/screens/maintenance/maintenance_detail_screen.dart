import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/localization/app_strings.dart';
import '../../core/localization/domain_labels.dart';
import '../../core/localization/formatters.dart';
import '../../core/network/error_messages.dart';
import '../../core/theme/ejari_palette.dart';
import '../../models/maintenance.dart';
import '../../providers/auth_provider.dart';
import '../../providers/core_providers.dart';
import '../../widgets/section_card.dart';
import '../../widgets/state_views.dart';
import '../../widgets/status_chip.dart';

class MaintenanceDetailScreen extends ConsumerStatefulWidget {
  const MaintenanceDetailScreen({super.key, required this.request});

  final MaintenanceRequest request;

  @override
  ConsumerState<MaintenanceDetailScreen> createState() => _MaintenanceDetailScreenState();
}

class _MaintenanceDetailScreenState extends ConsumerState<MaintenanceDetailScreen> {
  int _rating = 0;
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const LoadingView();

    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;
    final boot = auth.bootstrap;
    final request = widget.request;

    final unit = boot.unitById(request.unitId);
    final property = unit == null ? null : boot.propertyById(unit.propertyId);
    final raiser = boot.userById(request.byUserId);
    final (statusLabel, statusTone) = DomainLabels.maintenance(request.status, s);
    final canRate = request.status == 'done' && auth.user.isTenant && request.rating == 0;

    return Scaffold(
      appBar: AppBar(title: Text(s.maintenanceRequest)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        request.title.forLang(lang),
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.ink),
                      ),
                    ),
                    StatusChip(label: statusLabel, tone: statusTone),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    StatusChip(
                      label: DomainLabels.priority(request.priority, s),
                      tone: DomainLabels.priorityTone(request.priority),
                      icon: Icons.flag_outlined,
                    ),
                    StatusChip(
                      label: Fmt.dateTime(request.created, lang),
                      tone: Tone.neutral,
                      icon: Icons.event_outlined,
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            child: Column(
              children: [
                if (property != null)
                  _Row(
                    label: s.property,
                    value: unit == null
                        ? property.name.forLang(lang)
                        : '${property.name.forLang(lang)} · ${s.unit} ${unit.no}',
                  ),
                if (raiser != null) _Row(label: s.tenant, value: raiser.name.forLang(lang)),
                _Row(label: s.category, value: request.category),
                if (request.technician != null && request.technician!.isNotEmpty)
                  _Row(label: s.technician, value: request.technician!),
                if (request.rating > 0) _Row(label: s.rating, value: '${request.rating}/5'),
              ],
            ),
          ),
          if (canRate) ...[
            const SizedBox(height: 12),
            SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.rateService,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: p.ink),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      for (var i = 1; i <= 5; i++)
                        IconButton(
                          onPressed: _busy ? null : () => setState(() => _rating = i),
                          icon: Icon(
                            i <= _rating ? Icons.star_rounded : Icons.star_outline_rounded,
                            size: 32,
                            color: i <= _rating ? p.gold : p.ink3,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: (_busy || _rating == 0) ? null : _submitRating,
                      child: Text(s.save),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _submitRating() async {
    setState(() => _busy = true);
    try {
      await ref.read(ejariApiProvider).rateMaintenance(widget.request.id, _rating);
      await ref.read(authProvider.notifier).refresh();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppStrings.of(context).save)),
      );
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(describeApiError(e, AppStrings.of(context)))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 13.5, color: p.ink2)),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: p.ink),
            ),
          ),
        ],
      ),
    );
  }
}
