import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/localization/app_strings.dart';
import '../../core/localization/domain_labels.dart';
import '../../core/localization/formatters.dart';
import '../../core/theme/ejari_palette.dart';
import '../../models/contract.dart';
import '../../models/payment.dart';
import '../../providers/auth_provider.dart';
import '../../providers/core_providers.dart';
import '../../widgets/section_card.dart';
import '../../widgets/state_views.dart';
import '../../widgets/status_chip.dart';

/// Full contract detail: parties, terms, handover checklist, payments and the
/// server-rendered contract document.
class ContractDetailScreen extends ConsumerWidget {
  const ContractDetailScreen({super.key, required this.contract});

  final Contract contract;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const LoadingView();

    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;
    final boot = auth.bootstrap;

    final unit = boot.unitById(contract.unitId);
    final property = unit == null ? null : boot.propertyById(unit.propertyId);
    final landlord = boot.userById(contract.landlordId);
    final tenant = boot.userById(contract.tenantId);
    final payments = boot.paymentsOf(contract.id);
    final (statusLabel, statusTone) = DomainLabels.contract(contract.status, s);

    return Scaffold(
      appBar: AppBar(
        title: Text(contract.no),
        actions: [
          IconButton(
            tooltip: s.viewDocument,
            onPressed: () => _openDocument(context, ref, s),
            icon: const Icon(Icons.picture_as_pdf_outlined),
          ),
        ],
      ),
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
                        contract.no,
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.ink),
                      ),
                    ),
                    StatusChip(label: statusLabel, tone: statusTone),
                  ],
                ),
                const SizedBox(height: 14),
                _KeyValue(label: s.property, value: property?.name.forLang(lang) ?? '—'),
                if (unit != null) _KeyValue(label: s.unit, value: '${s.unit} ${unit.no}'),
                _KeyValue(label: s.landlord, value: landlord?.name.forLang(lang) ?? '—'),
                _KeyValue(label: s.tenant, value: tenant?.name.forLang(lang) ?? '—'),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _KeyValue(label: s.startDate, value: Fmt.date(contract.start, lang)),
                _KeyValue(label: s.endDate, value: Fmt.date(contract.end, lang)),
                _KeyValue(label: s.duration, value: '${contract.months} ${s.months}'),
                _KeyValue(label: s.rent, value: Fmt.money(contract.rent, s.currency)),
                _KeyValue(label: s.deposit, value: Fmt.money(contract.deposit, s.currency)),
                _KeyValue(label: s.dueDay, value: '${contract.dueDay}'),
                _KeyValue(label: s.frequency, value: DomainLabels.frequency(contract.freq, s)),
                _KeyValue(label: s.utilities, value: contract.utilities ? s.yes : s.no),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.status, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: p.ink)),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    StatusChip(
                      label: s.signedByLandlord,
                      tone: contract.signedLandlord ? Tone.success : Tone.neutral,
                      icon: contract.signedLandlord ? Icons.check_circle_outline : Icons.schedule_outlined,
                    ),
                    StatusChip(
                      label: s.signedByTenant,
                      tone: contract.signedTenant ? Tone.success : Tone.neutral,
                      icon: contract.signedTenant ? Icons.check_circle_outline : Icons.schedule_outlined,
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(s.checklist, style: TextStyle(fontSize: 13, color: p.ink2)),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(
                    value: contract.checklist.completed / 4,
                    minHeight: 7,
                    backgroundColor: p.surfaceAlt,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${contract.checklist.completed}/4',
                  style: TextStyle(fontSize: 12, color: p.ink3),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _PaymentsSection(payments: payments, s: s, lang: lang),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => _openDocument(context, ref, s),
            icon: const Icon(Icons.picture_as_pdf_outlined, size: 19),
            label: Text(s.viewDocument),
          ),
        ],
      ),
    );
  }

  Future<void> _openDocument(BuildContext context, WidgetRef ref, AppStrings s) async {
    final url = ref.read(ejariApiProvider).contractDocumentUrl(contract.id);
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.docDownloadFailed)));
    }
  }
}

class _PaymentsSection extends StatelessWidget {
  const _PaymentsSection({required this.payments, required this.s, required this.lang});

  final List<Payment> payments;
  final AppStrings s;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
            child: Text(
              '${s.payments} · ${payments.length}',
              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: p.ink),
            ),
          ),
          if (payments.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Text(s.noPayments, style: TextStyle(fontSize: 13, color: p.ink2)),
            )
          else
            for (var i = 0; i < payments.length && i < 6; i++) ...[
              if (i > 0) Divider(height: 1, color: p.line),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            DomainLabels.paymentKind(payments[i].kind, s),
                            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: p.ink),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            Fmt.date(payments[i].due, lang),
                            style: TextStyle(fontSize: 11.5, color: p.ink3),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      Fmt.money(payments[i].amount, s.currency),
                      style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: p.ink),
                    ),
                    const SizedBox(width: 10),
                    StatusChip(
                      label: DomainLabels.payment(payments[i].status, s).$1,
                      tone: DomainLabels.payment(payments[i].status, s).$2,
                    ),
                  ],
                ),
              ),
            ],
        ],
      ),
    );
  }
}

class _KeyValue extends StatelessWidget {
  const _KeyValue({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
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
