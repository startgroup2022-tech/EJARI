import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_strings.dart';
import '../../core/theme/ejari_palette.dart';
import '../../providers/auth_provider.dart';
import '../../routing/app_routes.dart';
import '../../widgets/section_card.dart';
import '../../widgets/state_views.dart';
import '../notifications/notifications_screen.dart';
import '../profile/profile_screen.dart';
import '../requests/requests_screen.dart';

/// The "More" tab: secondary destinations plus the profile entry point.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const LoadingView();

    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;
    final user = auth.user;
    final boot = auth.bootstrap;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        SectionCard(
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const ProfileScreen()),
          ),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(color: p.brandSoft, shape: BoxShape.circle),
                child: Center(
                  child: Text(
                    _initials(user.name.forLang(lang)),
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: p.brand),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user.name.forLang(lang),
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: p.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      user.email,
                      style: TextStyle(fontSize: 12.5, color: p.ink3),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_left_rounded, color: p.ink3),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Text(s.navMore, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: p.ink)),
        const SizedBox(height: 10),
        SectionCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              _Tile(
                icon: Icons.room_service_outlined,
                label: s.services,
                onTap: () => Navigator.of(context).pushNamed(AppRoutes.services),
              ),
              Divider(height: 1, color: p.line),
              _Tile(
                icon: Icons.assignment_outlined,
                label: s.myRequests,
                trailing: boot.requests.isEmpty ? null : '${boot.requests.length}',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const RequestsScreen()),
                ),
              ),
              Divider(height: 1, color: p.line),
              _Tile(
                icon: Icons.folder_outlined,
                label: s.documents,
                trailing: boot.documents.isEmpty ? null : '${boot.documents.length}',
                onTap: () => Navigator.of(context).pushNamed(AppRoutes.documents),
              ),
              Divider(height: 1, color: p.line),
              _Tile(
                icon: Icons.notifications_none_rounded,
                label: s.notifications,
                trailing: boot.unreadCount > 0 ? '${boot.unreadCount}' : null,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const NotificationsScreen()),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SectionCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              _Tile(
                icon: Icons.person_outline_rounded,
                label: s.profile,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ProfileScreen()),
                ),
              ),
              Divider(height: 1, color: p.line),
              _Tile(
                icon: Icons.info_outline_rounded,
                label: s.about,
                trailing: 'v1.0.0',
                onTap: () => showAboutDialog(
                  context: context,
                  applicationName: s.appName,
                  applicationVersion: '1.0.0',
                  applicationIcon: const Icon(Icons.apartment_rounded, size: 34),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        Center(
          child: Text(
            '${s.appName} · ${s.version} 1.0.0',
            style: TextStyle(fontSize: 12, color: p.ink3),
          ),
        ),
      ],
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((x) => x.isNotEmpty).toList();
    if (parts.isEmpty) return '؟';
    if (parts.length == 1) return parts.first.characters.first;
    return '${parts.first.characters.first}${parts.last.characters.first}';
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.label, required this.onTap, this.trailing});

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return ListTile(
      onTap: onTap,
      leading: Icon(icon, size: 21, color: p.ink2),
      title: Text(
        label,
        style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500, color: p.ink),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (trailing != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: p.surfaceAlt,
                borderRadius: BorderRadius.circular(99),
              ),
              child: Text(
                trailing!,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: p.ink2),
              ),
            ),
          const SizedBox(width: 6),
          Icon(Icons.chevron_left_rounded, size: 20, color: p.ink3),
        ],
      ),
    );
  }
}
