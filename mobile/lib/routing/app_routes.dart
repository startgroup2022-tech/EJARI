import 'package:flutter/material.dart';

import '../models/contract.dart';
import '../models/maintenance.dart';
import '../models/property.dart';
import '../models/service.dart';
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
}

/// Builds pushed (non-tab) screens. Tab screens live inside the app shell.
Route<dynamic>? onGenerateAppRoute(RouteSettings settings) {
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
