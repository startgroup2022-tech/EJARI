import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_strings.dart';
import '../../core/localization/domain_labels.dart';
import '../../core/localization/formatters.dart';
import '../../core/theme/ejari_palette.dart';
import '../../models/contract.dart';
import '../../providers/auth_provider.dart';
import '../../routing/app_routes.dart';
import '../../widgets/section_card.dart';
import '../../widgets/state_views.dart';
import '../../widgets/status_chip.dart';

/// Contract list. The backend already scopes rows to the signed-in user, so this
/// screen only presents what it was given.
class ContractsScreen extends ConsumerStatefulWidget {
  const ContractsScreen({super.key});

  @override
  ConsumerState<ContractsScreen> createState() => _ContractsScreenState();
}

class _ContractsScreenState extends ConsumerState<ContractsScreen> {
  String _filter = 'all';

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const LoadingView();

    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;
    final boot = auth.bootstrap;

    final filters = <(String, String)>[
      ('all', s.all),
      ('active', s.statusDone),
      ('pending_pay', s.due),
      ('expiring', s.upcoming),
      ('expired', s.statusDone),
    ];

    final contracts = _filter == 'all'
        ? boot.contracts
        : boot.contracts.where((c) => c.status == _filter).toList();

    return Column(
      children: [
        SizedBox(
          height: 46,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            itemCount: filters.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final (value, label) = filters[i];
              final on = _filter == value;
              final count = value == 'all'
                  ? boot.contracts.length
                  : boot.contracts.where((c) => c.status == value).length;
              return ChoiceChip(
                selected: on,
                onSelected: (_) => setState(() => _filter = value),
                label: Text('$label${count > 0 ? ' · $count' : ''}'),
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
            child: contracts.isEmpty
                ? ListView(
                    children: [
                      SizedBox(height: MediaQuery.sizeOf(context).height * 0.16),
                      EmptyView(
                        icon: Icons.description_outlined,
                        message: s.noContracts,
                      ),
                    ],
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
                    itemCount: contracts.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, i) => _ContractTile(
                      contract: contracts[i],
                      boot: boot,
                      s: s,
                      lang: lang,
                    ),
                  ),
          ),
        ),
      ],
    );
  }
}

class _ContractTile extends StatelessWidget {
  const _ContractTile({
    required this.contract,
    required this.boot,
    required this.s,
    required this.lang,
  });

  final Contract contract;
  final dynamic boot;
  final AppStrings s;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final (statusLabel, statusTone) = DomainLabels.contract(contract.status, s);
    final unit = boot.unitById(contract.unitId);
    final property = unit == null ? null : boot.propertyById(unit.propertyId);
    final other = boot.userById(
      contract.tenantId == boot.me.id ? contract.landlordId : contract.tenantId,
    );
    final otherIsLandlord = contract.tenantId == boot.me.id;

    return SectionCard(
      onTap: () => Navigator.of(context).pushNamed(AppRoutes.contractDetail, arguments: contract),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  contract.no,
                  style: TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                    color: p.ink,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
              StatusChip(label: statusLabel, tone: statusTone),
            ],
          ),
          const SizedBox(height: 10),
          if (property != null)
            _Line(
              icon: Icons.apartment_rounded,
              text: unit == null
                  ? property.name.forLang(lang)
                  : '${property.name.forLang(lang)} · ${s.unit} ${unit.no}',
            ),
          if (other != null)
            _Line(
              icon: otherIsLandlord ? Icons.person_outline_rounded : Icons.badge_outlined,
              text: '${otherIsLandlord ? s.landlord : s.tenant}: ${other.name.forLang(lang)}',
            ),
          const SizedBox(height: 10),
          Row(
            children: [
              _Stat(label: s.rent, value: Fmt.money(contract.rent, s.currency)),
              const SizedBox(width: 18),
              _Stat(
                label: s.endDate,
                value: Fmt.date(contract.end, lang),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Row(
        children: [
          Icon(icon, size: 15, color: p.ink3),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: 13, color: p.ink2),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 11, color: p.ink3)),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: p.ink)),
      ],
    );
  }
}
