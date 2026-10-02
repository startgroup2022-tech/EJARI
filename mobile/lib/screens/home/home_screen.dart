import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_strings.dart';
import '../../core/localization/domain_labels.dart';
import '../../core/localization/formatters.dart';
import '../../core/theme/ejari_palette.dart';
import '../../models/app_user.dart';
import '../../models/bootstrap.dart';
import '../../providers/auth_provider.dart';
import '../../routing/app_routes.dart';
import '../../widgets/kpi_card.dart';
import '../../widgets/section_card.dart';
import '../../widgets/state_views.dart';
import '../notifications/notifications_screen.dart';

/// Role-aware dashboard. Every number is derived from the backend snapshot —
/// nothing is hardcoded.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const LoadingView();

    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;
    final boot = auth.bootstrap;
    final user = auth.user;

    return RefreshIndicator(
      onRefresh: () => ref.read(authProvider.notifier).refresh(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          _Greeting(user: user, roleLabel: DomainLabels.roleLabel(user.role.name, s)),
          const SizedBox(height: 18),

          Text(
            s.overview,
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.ink),
          ),
          const SizedBox(height: 10),
          _KpiGrid(boot: boot, role: user.role, s: s, lang: lang),
          const SizedBox(height: 22),

          Text(
            s.quickActions,
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.ink),
          ),
          const SizedBox(height: 10),
          _QuickActions(role: user.role),
          const SizedBox(height: 22),

          Text(
            s.recentActivity,
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.ink),
          ),
          const SizedBox(height: 10),
          _RecentActivity(boot: boot, lang: lang),
        ],
      ),
    );
  }
}

class _Greeting extends StatelessWidget {
  const _Greeting({required this.user, required this.roleLabel});

  final AppUser user;
  final String roleLabel;

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [p.primary, p.primary.withValues(alpha: 0.86)],
          begin: AlignmentDirectional.topStart,
          end: AlignmentDirectional.bottomEnd,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${s.hello}،',
                  style: TextStyle(fontSize: 13.5, color: p.onPrimary.withValues(alpha: 0.75)),
                ),
                const SizedBox(height: 3),
                Text(
                  user.name.forLang(lang),
                  style: TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                    color: p.onPrimary,
                    height: 1.3,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: p.onPrimary.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    roleLabel,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: p.onPrimary,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Icon(Icons.apartment_rounded, size: 46, color: p.onPrimary.withValues(alpha: 0.22)),
        ],
      ),
    );
  }
}

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.boot, required this.role, required this.s, required this.lang});

  final Bootstrap boot;
  final UserRole role;
  final AppStrings s;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final paid = boot.payments.where((p) => p.isPaid);
    final overdue = boot.payments.where((p) => p.isOverdue);
    final now = DateTime.now();
    final collectedThisMonth = paid
        .where((p) => p.paidOn != null && p.paidOn!.year == now.year && p.paidOn!.month == now.month)
        .fold<double>(0, (a, p) => a + p.amount);

    final cards = <Widget>[
      if (role == UserRole.landlord || role == UserRole.admin)
        KpiCard(
          label: s.propertiesCount,
          value: Fmt.number(boot.properties.length),
          unit: '· ${Fmt.number(boot.units.length)} ${s.units}',
          icon: Icons.apartment_rounded,
          tone: Tone.brand,
        ),
      KpiCard(
        label: s.contractsCount,
        value: Fmt.number(boot.contracts.length),
        hint: boot.contracts.where((c) => c.status == 'active').isEmpty
            ? null
            : '${boot.contracts.where((c) => c.status == 'active').length} ${s.statusDone}',
        icon: Icons.description_rounded,
        tone: Tone.info,
      ),
      KpiCard(
        label: s.collectedThisMonth,
        value: Fmt.number(collectedThisMonth),
        unit: s.currency,
        icon: Icons.trending_up_rounded,
        tone: Tone.success,
      ),
      KpiCard(
        label: s.overduePayments,
        value: Fmt.number(overdue.length),
        hint: overdue.isEmpty ? null : Fmt.money(overdue.fold<double>(0, (a, p) => a + p.amount), s.currency),
        icon: Icons.error_outline_rounded,
        tone: overdue.isEmpty ? Tone.neutral : Tone.danger,
      ),
      KpiCard(
        label: s.maintenance,
        value: Fmt.number(boot.maintenance.where((m) => m.status != 'done').length),
        hint: '${boot.maintenance.length} ${s.all}',
        icon: Icons.build_rounded,
        tone: Tone.warn,
      ),
      KpiCard(
        label: s.myRequests,
        value: Fmt.number(boot.requests.length),
        hint: boot.requests.isEmpty
            ? null
            : '${boot.requests.where((r) => r.status == 'completed').length} ${s.requestStatusCompleted}',
        icon: Icons.assignment_rounded,
        tone: Tone.gold,
      ),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 720 ? 3 : (constraints.maxWidth >= 460 ? 2 : 2);
        return GridView.count(
          crossAxisCount: columns,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: constraints.maxWidth >= 720 ? 1.5 : 1.28,
          children: cards,
        );
      },
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.role});

  final UserRole role;

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    final p = context.palette;

    final items = <_Action>[
      if (role == UserRole.tenant)
        _Action(s.newRequest, Icons.add_circle_outline_rounded, () {
          Navigator.of(context).pushNamed(AppRoutes.maintenanceNew);
        }),
      _Action(s.services, Icons.room_service_outlined, () {
        Navigator.of(context).pushNamed(AppRoutes.services);
      }),
      _Action(s.documents, Icons.folder_outlined, () {
        Navigator.of(context).pushNamed(AppRoutes.documents);
      }),
      _Action(s.notifications, Icons.notifications_none_rounded, () {
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const NotificationsScreen()),
        );
      }),
    ];

    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        for (final a in items)
          Material(
            color: p.surface,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: a.onTap,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: p.line),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(a.icon, size: 18, color: p.brand),
                    const SizedBox(width: 8),
                    Text(
                      a.label,
                      style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: p.ink),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _Action {
  const _Action(this.label, this.icon, this.onTap);
  final String label;
  final IconData icon;
  final VoidCallback onTap;
}

class _RecentActivity extends StatelessWidget {
  const _RecentActivity({required this.boot, required this.lang});

  final Bootstrap boot;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    final p = context.palette;

    if (boot.notifications.isEmpty) {
      return SectionCard(
        child: Row(
          children: [
            Icon(Icons.notifications_none_rounded, size: 20, color: p.ink3),
            const SizedBox(width: 10),
            Expanded(child: Text(s.noNotifications, style: TextStyle(fontSize: 13.5, color: p.ink2))),
          ],
        ),
      );
    }

    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < boot.notifications.length && i < 5; i++) ...[
            if (i > 0) Divider(height: 1, color: p.line),
            _NotificationRow(notification: boot.notifications[i], lang: lang),
          ],
        ],
      ),
    );
  }
}

class _NotificationRow extends StatelessWidget {
  const _NotificationRow({required this.notification, required this.lang});

  final dynamic notification;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: p.brandSoft, borderRadius: BorderRadius.circular(10)),
            child: Icon(
              DomainLabels.notificationIcon('${notification.type}'),
              size: 17,
              color: p.brand,
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  notification.text.forLang(lang),
                  style: TextStyle(fontSize: 13.5, color: p.ink, height: 1.5, fontWeight: FontWeight.w500),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 3),
                Text(
                  Fmt.dateTime(notification.createdAt, lang),
                  style: TextStyle(fontSize: 11.5, color: p.ink3),
                ),
              ],
            ),
          ),
          if (!notification.read)
            Container(
              width: 8,
              height: 8,
              margin: const EdgeInsets.only(top: 6),
              decoration: BoxDecoration(color: p.bad, shape: BoxShape.circle),
            ),
        ],
      ),
    );
  }
}
