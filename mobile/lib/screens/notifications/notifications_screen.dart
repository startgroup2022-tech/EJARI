import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/localization/app_strings.dart';
import '../../core/localization/domain_labels.dart';
import '../../core/localization/formatters.dart';
import '../../core/theme/ejari_palette.dart';
import '../../providers/auth_provider.dart';
import '../../providers/core_providers.dart';
import '../../widgets/state_views.dart';

/// Notifications with real read/unread state persisted on the backend.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _busy = false;

  Future<void> _markAll() async {
    setState(() => _busy = true);
    try {
      await ref.read(ejariApiProvider).markAllNotificationsRead();
      await ref.read(authProvider.notifier).refresh();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.kind.name)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _markOne(String id) async {
    try {
      await ref.read(ejariApiProvider).markNotificationRead(id);
      await ref.read(authProvider.notifier).refresh();
    } on ApiException {
      // A single failed mark is not worth interrupting the user for.
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const LoadingView();

    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;
    final items = auth.bootstrap.notifications;
    final unread = auth.bootstrap.unreadCount;

    return Scaffold(
      appBar: AppBar(
        title: Text(s.notifications),
        actions: [
          if (unread > 0)
            TextButton(
              onPressed: _busy ? null : _markAll,
              child: Text(s.markAllRead),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(authProvider.notifier).refresh(),
        child: items.isEmpty
            ? ListView(
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.2),
                  EmptyView(icon: Icons.notifications_none_rounded, message: s.noNotifications),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  final n = items[i];
                  return Material(
                    color: n.read ? p.surface : p.brandSoft.withValues(alpha: 0.45),
                    borderRadius: BorderRadius.circular(14),
                    child: InkWell(
                      onTap: n.read ? null : () => _markOne(n.id),
                      borderRadius: BorderRadius.circular(14),
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: n.read ? p.line : p.brand.withValues(alpha: 0.3)),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 38,
                              height: 38,
                              decoration: BoxDecoration(
                                color: p.brandSoft,
                                borderRadius: BorderRadius.circular(11),
                              ),
                              child: Icon(
                                DomainLabels.notificationIcon(n.type),
                                size: 19,
                                color: p.brand,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    n.text.forLang(lang),
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: n.read ? FontWeight.w500 : FontWeight.w700,
                                      color: p.ink,
                                      height: 1.5,
                                    ),
                                  ),
                                  if (n.subtitle != null &&
                                      n.subtitle!.forLang(lang).isNotEmpty) ...[
                                    const SizedBox(height: 4),
                                    Text(
                                      n.subtitle!.forLang(lang),
                                      style: TextStyle(fontSize: 12.5, color: p.ink2, height: 1.5),
                                    ),
                                  ],
                                  const SizedBox(height: 5),
                                  Text(
                                    Fmt.dateTime(n.createdAt, lang),
                                    style: TextStyle(fontSize: 11.5, color: p.ink3),
                                  ),
                                ],
                              ),
                            ),
                            if (!n.read)
                              Container(
                                width: 9,
                                height: 9,
                                margin: const EdgeInsets.only(top: 4, left: 6),
                                decoration: BoxDecoration(color: p.bad, shape: BoxShape.circle),
                              ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
