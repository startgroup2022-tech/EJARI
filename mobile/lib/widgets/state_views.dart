import 'package:flutter/material.dart';

import '../core/localization/app_strings.dart';
import '../core/theme/ejari_palette.dart';

/// Centred progress indicator used while a screen loads.
class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.label});

  final String? label;

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    final p = context.palette;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 30,
            height: 30,
            child: CircularProgressIndicator(strokeWidth: 2.6),
          ),
          const SizedBox(height: 14),
          Text(label ?? s.loading, style: TextStyle(color: p.ink2, fontSize: 14)),
        ],
      ),
    );
  }
}

/// Shown when a request fails. Always offers a retry.
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    final p = context.palette;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(color: p.badSoft, shape: BoxShape.circle),
              child: Icon(Icons.cloud_off_rounded, color: p.bad, size: 28),
            ),
            const SizedBox(height: 16),
            Text(
              s.somethingWentWrong,
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.ink),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: p.ink2, height: 1.6),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 19),
              label: Text(s.retry),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shown when a request succeeds but returns nothing.
class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.message, this.icon, this.action});

  final String message;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(color: p.surfaceAlt, shape: BoxShape.circle),
              child: Icon(icon ?? Icons.inbox_rounded, color: p.ink3, size: 28),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 15, color: p.ink2, height: 1.6),
            ),
            if (action != null) ...[const SizedBox(height: 18), action!],
          ],
        ),
      ),
    );
  }
}

/// Wraps a list body so pull-to-refresh is available wherever data is shown.
class RefreshableBody extends StatelessWidget {
  const RefreshableBody({super.key, required this.onRefresh, required this.child});

  final Future<void> Function() onRefresh;
  final Widget child;

  @override
  Widget build(BuildContext context) => RefreshIndicator(onRefresh: onRefresh, child: child);
}
