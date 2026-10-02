import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/localization/app_strings.dart';
import 'core/theme/app_theme.dart';
import 'providers/auth_provider.dart';
import 'providers/core_providers.dart';
import 'routing/app_routes.dart';
import 'screens/auth/login_screen.dart';
import 'screens/shell/app_shell.dart';
import 'widgets/state_views.dart';

class EjariApp extends ConsumerStatefulWidget {
  const EjariApp({super.key});

  @override
  ConsumerState<EjariApp> createState() => _EjariAppState();
}

class _EjariAppState extends ConsumerState<EjariApp> {
  @override
  void initState() {
    super.initState();
    // Restore a persisted session once the first frame is up.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authProvider.notifier).restore();
    });
  }

  @override
  Widget build(BuildContext context) {
    final locale = ref.watch(localeProvider);
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp(
      title: 'Ejari',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      locale: locale,
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        AppStrings.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      onGenerateRoute: onGenerateAppRoute,
      home: const _Root(),
      builder: (context, child) {
        // Arabic-first: force RTL for Arabic and LTR for English regardless of device locale.
        final lang = Localizations.localeOf(context).languageCode;
        return Directionality(
          textDirection: lang == 'ar' ? TextDirection.rtl : TextDirection.ltr,
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}

/// Decides between Login and the signed-in shell from the real auth state.
class _Root extends ConsumerWidget {
  const _Root();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final s = AppStrings.of(context);

    return switch (auth) {
      AuthUnknown() => const Scaffold(body: LoadingView()),
      AuthSignedOut(sessionExpired: final expired) => LoginScreen(
          sessionExpiredMessage: expired ? s.sessionExpired : null,
        ),
      AuthSignedIn() => const AppShell(),
    };
  }
}
