import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/localization/app_strings.dart';
import '../../core/localization/domain_labels.dart';
import '../../core/localization/formatters.dart';
import '../../core/network/error_messages.dart';
import '../../core/theme/ejari_palette.dart';
import '../../models/payment.dart';
import '../../providers/auth_provider.dart';
import '../../providers/core_providers.dart';
import '../../widgets/kpi_card.dart';
import '../../widgets/section_card.dart';
import '../../widgets/state_views.dart';
import '../../widgets/status_chip.dart';

/// Payment history and the tenant's real pay action.
///
/// Paying calls `POST /api/payments/:id/pay`, which is the only payment mechanism
/// the backend implements — there is no card gateway, so the UI records the
/// selected method rather than pretending a gateway exists.
class PaymentsScreen extends ConsumerStatefulWidget {
  const PaymentsScreen({super.key});

  @override
  ConsumerState<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends ConsumerState<PaymentsScreen> {
  String _filter = 'all';
  String? _busyId;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const LoadingView();

    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;
    final boot = auth.bootstrap;
    final isTenant = auth.user.isTenant;

    final all = boot.payments;
    final filtered = switch (_filter) {
      'paid' => all.where((x) => x.status == 'paid').toList(),
      'due' => all.where((x) => x.status == 'due' || x.status == 'upcoming').toList(),
      'overdue' => all.where((x) => x.isOverdue).toList(),
      _ => all,
    }..sort((a, b) {
        final ad = a.due?.millisecondsSinceEpoch ?? 0;
        final bd = b.due?.millisecondsSinceEpoch ?? 0;
        return bd.compareTo(ad);
      });

    final collected = all.where((x) => x.isPaid).fold<double>(0, (a, x) => a + x.amount);
    final outstanding = all
        .where((x) => !x.isPaid)
        .fold<double>(0, (a, x) => a + x.amount);

    final filters = <(String, String)>[
      ('all', s.all),
      ('paid', s.paid),
      ('due', s.due),
      ('overdue', s.overdue),
    ];

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
          child: Row(
            children: [
              Expanded(
                child: KpiCard(
                  label: s.paid,
                  value: Fmt.number(collected),
                  unit: s.currency,
                  icon: Icons.check_circle_outline_rounded,
                  tone: Tone.success,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: KpiCard(
                  label: s.due,
                  value: Fmt.number(outstanding),
                  unit: s.currency,
                  icon: Icons.schedule_rounded,
                  tone: outstanding > 0 ? Tone.warn : Tone.neutral,
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 44,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            itemCount: filters.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final (value, label) = filters[i];
              final on = _filter == value;
              final count = switch (value) {
                'paid' => all.where((x) => x.isPaid).length,
                'due' => all.where((x) => x.status == 'due' || x.status == 'upcoming').length,
                'overdue' => all.where((x) => x.isOverdue).length,
                _ => all.length,
              };
              return ChoiceChip(
                selected: on,
                onSelected: (_) => setState(() => _filter = value),
                label: Text('$label · $count'),
                labelStyle: TextStyle(
                  fontSize: 12.5,
                  fontWeight: on ? FontWeight.w700 : FontWeight.w500,
                  color: on ? p.brand : p.ink2,
                ),
                selectedColor: p.brandSoft,
                backgroundColor: p.surface,
                side: BorderSide(color: on ? p.brand.withValues(alpha: 0.35) : p.line),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
                showCheckmark: false,
              );
            },
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => ref.read(authProvider.notifier).refresh(),
            child: filtered.isEmpty
                ? ListView(
                    children: [
                      SizedBox(height: MediaQuery.sizeOf(context).height * 0.14),
                      EmptyView(icon: Icons.payments_outlined, message: s.noPayments),
                    ],
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, i) => _PaymentTile(
                      payment: filtered[i],
                      boot: boot,
                      s: s,
                      lang: lang,
                      canPay: isTenant && !filtered[i].isPaid,
                      busy: _busyId == filtered[i].id,
                      onPay: () => _confirmPay(filtered[i]),
                    ),
                  ),
          ),
        ),
      ],
    );
  }

  Future<void> _confirmPay(Payment payment) async {
    final s = AppStrings.of(context);
    final method = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.method,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: ctx.palette.ink,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${Fmt.money(payment.amount, s.currency)} · ${Fmt.date(payment.due, Localizations.localeOf(ctx).languageCode)}',
                    style: TextStyle(fontSize: 13.5, color: ctx.palette.ink2),
                  ),
                ],
              ),
            ),
            ListTile(
              leading: const Icon(Icons.account_balance_wallet_outlined),
              title: Text(s.methodBenefit),
              onTap: () => Navigator.pop(ctx, 'benefit'),
            ),
            ListTile(
              leading: const Icon(Icons.credit_card_outlined),
              title: Text(s.methodCard),
              onTap: () => Navigator.pop(ctx, 'card'),
            ),
            ListTile(
              leading: const Icon(Icons.account_balance_outlined),
              title: Text(s.methodTransfer),
              onTap: () => Navigator.pop(ctx, 'transfer'),
            ),
            ListTile(
              leading: const Icon(Icons.payments_outlined),
              title: Text(s.methodCash),
              onTap: () => Navigator.pop(ctx, 'cash'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (method == null) return;
    if (!mounted) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(s.payConfirmTitle),
        content: Text(s.payConfirmBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.cancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s.confirm)),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busyId = payment.id);
    try {
      await ref.read(ejariApiProvider).pay(payment.id, method);
      await ref.read(authProvider.notifier).refresh();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.paySuccess)));
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(describeApiError(e, AppStrings.of(context)))));
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({
    required this.payment,
    required this.boot,
    required this.s,
    required this.lang,
    required this.canPay,
    required this.busy,
    required this.onPay,
  });

  final Payment payment;
  final dynamic boot;
  final AppStrings s;
  final String lang;
  final bool canPay;
  final bool busy;
  final VoidCallback onPay;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final (label, tone) = DomainLabels.payment(payment.status, s);
    final contract = boot.contractById(payment.contractId);

    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      Fmt.money(payment.amount, s.currency),
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.ink),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      contract == null
                          ? DomainLabels.paymentKind(payment.kind, s)
                          : '${contract.no} · ${DomainLabels.paymentKind(payment.kind, s)}',
                      style: TextStyle(fontSize: 12.5, color: p.ink3),
                    ),
                  ],
                ),
              ),
              StatusChip(label: label, tone: tone),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              StatusChip(
                label: '${s.dueDate}: ${Fmt.date(payment.due, lang)}',
                tone: Tone.neutral,
                icon: Icons.event_outlined,
              ),
              if (payment.paidOn != null)
                StatusChip(
                  label: '${s.paidOn}: ${Fmt.date(payment.paidOn, lang)}',
                  tone: Tone.success,
                  icon: Icons.event_available_outlined,
                ),
              if (payment.method != null)
                StatusChip(
                  label: DomainLabels.paymentMethod(payment.method, s),
                  tone: Tone.info,
                  icon: Icons.credit_card_outlined,
                ),
              if (payment.receipt != null)
                StatusChip(label: payment.receipt!, tone: Tone.gold, icon: Icons.receipt_long_outlined),
            ],
          ),
          if (canPay) ...[
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: busy ? null : onPay,
                icon: busy
                    ? const SizedBox(
                        width: 17,
                        height: 17,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.payments_rounded, size: 19),
                label: Text(s.payNow),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
