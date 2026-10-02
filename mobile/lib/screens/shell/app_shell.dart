import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/localization/app_strings.dart';
import '../../core/theme/ejari_palette.dart';
import '../../models/app_user.dart';
import '../../providers/auth_provider.dart';
import '../contracts/contracts_screen.dart';
import '../home/home_screen.dart';
import '../maintenance/maintenance_screen.dart';
import '../more/more_screen.dart';
import '../notifications/notifications_screen.dart';
import '../payments/payments_screen.dart';
import '../properties/properties_screen.dart';
import '../../widgets/ejari_logo.dart';

/// The signed-in shell: role-aware bottom navigation plus a notifications bell.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  int _index = 0;

  List<_Tab> _tabsFor(UserRole role, AppStrings s) => switch (role) {
        // A tenant cares about their lease, their payments and their requests.
        UserRole.tenant => [
            _Tab(s.navHome, Icons.home_outlined, Icons.home_rounded),
            _Tab(s.navContracts, Icons.description_outlined, Icons.description_rounded),
            _Tab(s.navPayments, Icons.payments_outlined, Icons.payments_rounded),
            _Tab(s.navMaintenance, Icons.build_outlined, Icons.build_rounded),
            _Tab(s.navMore, Icons.more_horiz_rounded, Icons.more_horiz_rounded),
          ],
        // A landlord manages the portfolio first.
        _ => [
            _Tab(s.navHome, Icons.home_outlined, Icons.home_rounded),
            _Tab(s.navProperties, Icons.apartment_outlined, Icons.apartment_rounded),
            _Tab(s.navContracts, Icons.description_outlined, Icons.description_rounded),
            _Tab(s.navPayments, Icons.payments_outlined, Icons.payments_rounded),
            _Tab(s.navMore, Icons.more_horiz_rounded, Icons.more_horiz_rounded),
          ],
      };

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    final p = context.palette;
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const SizedBox.shrink();

    final role = auth.user.role;
    final tabs = _tabsFor(role, s);
    final safeIndex = _index.clamp(0, tabs.length - 1);

    final pages = switch (role) {
      UserRole.tenant => const [
          HomeScreen(),
          ContractsScreen(),
          PaymentsScreen(),
          MaintenanceTab(),
          MoreScreen(),
        ],
      _ => const [
          HomeScreen(),
          PropertiesScreen(),
          ContractsScreen(),
          PaymentsScreen(),
          MoreScreen(),
        ],
    };

    final unread = auth.bootstrap.unreadCount;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          children: [
            const EjariLogo(height: 30),
            const SizedBox(width: 10),
            Text(tabs[safeIndex].label),
          ],
        ),
        actions: [
          IconButton(
            tooltip: s.notifications,
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const NotificationsScreen()),
            ),
            icon: Badge(
              isLabelVisible: unread > 0,
              label: Text('$unread'),
              backgroundColor: p.bad,
              child: const Icon(Icons.notifications_none_rounded),
            ),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: IndexedStack(index: safeIndex, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: safeIndex,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          for (final t in tabs)
            NavigationDestination(
              icon: Icon(t.icon),
              selectedIcon: Icon(t.selectedIcon),
              label: t.label,
            ),
        ],
      ),
    );
  }
}

class _Tab {
  const _Tab(this.label, this.icon, this.selectedIcon);
  final String label;
  final IconData icon;
  final IconData selectedIcon;
}
