import 'package:flutter/material.dart';

import '../models/contract.dart';
import '../models/maintenance.dart';
import '../models/property.dart';
import '../models/service.dart';
import '../screens/auth/reset_password_screen.dart';
import '../screens/contracts/contract_detail_screen.dart';
import '../screens/documents/documents_screen.dart';
import '../screens/maintenance/maintenance_detail_screen.dart';
import '../screens/maintenance/maintenance_form_screen.dart';
import '../screens/properties/property_detail_screen.dart';
import '../screens/requests/request_detail_screen.dart';
import '../screens/requests/service_detail_screen.dart';
import '../screens/requests/services_screen.dart';

/// Route names and the arguments they expect.
class AppRoutes {
  AppRoutes._();

  static const contractDetail = '/contracts/detail';
  static const propertyDetail = '/properties/detail';
  static const maintenanceNew = '/maintenance/new';
  static const maintenanceDetail = '/maintenance/detail';
  static const services = '/services';
  static const serviceDetail = '/services/detail';
  static const requestDetail = '/requests/detail';
  static const documents = '/documents';
  static const resetPassword = '/auth/reset-password';

  /// Parses a `reset.html?token=…` link (or an `ejari://reset-password?token=…`
  /// deep link) into the reset-password route, so a reset email can open the app.
  /// Returns null when the link is not a reset link.
  static String? resetRouteFromUri(Uri uri) {
    final token = resetTokenFromUri(uri);
    if (token == null) return null;
    return Uri(path: resetPassword, queryParameters: {'token': token}).toString();
  }

  /// Extracts the reset token from a reset link, or null if the link is not one.
  /// Accepts the web page (`…/reset.html?token=`), the in-app route and the
  /// `ejari://reset-password?token=` deep link.
  static String? resetTokenFromUri(Uri uri) {
    final token = uri.queryParameters['token'];
    if (token == null || token.isEmpty) return null;
    final isResetLink = uri.path.endsWith('reset.html') ||
        uri.path.endsWith('reset-password') ||
        uri.host == 'reset-password';
    return isResetLink ? token : null;
  }

  /// Extracts a reset token from a raw route name — the form Flutter hands to
  /// [onGenerateAppRoute] for a deep link (`ejari://reset-password?token=…`) or
  /// an in-app push (`/auth/reset-password?token=…`).
  static String? resetTokenFromName(String routeName) {
    if (routeName.isEmpty) return null;
    if (routeName == resetPassword) return null;
    if (!routeName.startsWith(resetPassword) &&
        !routeName.startsWith('ejari://') &&
        !routeName.contains('reset.html')) {
      return null;
    }
    return resetTokenFromUri(Uri.parse(routeName));
  }
}

/// Builds pushed (non-tab) screens. Tab screens live inside the app shell.
Route<dynamic>? onGenerateAppRoute(RouteSettings settings) {
  // Reset links carry the token in the query string, so match before the plain
  // route table. Handles both in-app pushes and native deep links.
  final resetToken = AppRoutes.resetTokenFromName(settings.name ?? '');
  if (resetToken != null) {
    return MaterialPageRoute(
      settings: settings,
      builder: (_) => ResetPasswordScreen(token: resetToken),
    );
  }

  switch (settings.name) {
    case AppRoutes.contractDetail:
      final contract = settings.arguments as Contract;
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => ContractDetailScreen(contract: contract),
      );

    case AppRoutes.propertyDetail:
      final property = settings.arguments as Property;
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => PropertyDetailScreen(property: property),
      );

    case AppRoutes.maintenanceNew:
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const MaintenanceFormScreen(),
      );

    case AppRoutes.maintenanceDetail:
      final request = settings.arguments as MaintenanceRequest;
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => MaintenanceDetailScreen(request: request),
      );

    case AppRoutes.services:
      return MaterialPageRoute(settings: settings, builder: (_) => const ServicesScreen());

    case AppRoutes.serviceDetail:
      final service = settings.arguments as Service;
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => ServiceDetailScreen(service: service),
      );

    case AppRoutes.requestDetail:
      final request = settings.arguments as ServiceRequest;
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => RequestDetailScreen(request: request),
      );

    case AppRoutes.documents:
      return MaterialPageRoute(settings: settings, builder: (_) => const DocumentsScreen());
  }
  return null;
}
