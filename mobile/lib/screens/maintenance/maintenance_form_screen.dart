import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/localization/app_strings.dart';
import '../../core/network/error_messages.dart';
import '../../core/theme/ejari_palette.dart';
import '../../providers/auth_provider.dart';
import '../../providers/core_providers.dart';

/// Raises a real maintenance request via `POST /api/maintenance`.
///
/// The backend requires the tenant to hold an active contract; if they do not,
/// the server's error is surfaced verbatim rather than masked.
class MaintenanceFormScreen extends ConsumerStatefulWidget {
  const MaintenanceFormScreen({super.key});

  @override
  ConsumerState<MaintenanceFormScreen> createState() => _MaintenanceFormScreenState();
}

class _MaintenanceFormScreenState extends ConsumerState<MaintenanceFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();

  String _category = 'plumbing';
  String _priority = 'normal';
  bool _busy = false;
  String? _error;

  static const _categories = ['plumbing', 'electrical', 'ac', 'elevator', 'cleaning', 'other'];
  static const _priorities = ['low', 'normal', 'high'];

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(ejariApiProvider).createMaintenance(
            title: _title.text.trim(),
            category: _category,
            priority: _priority,
          );
      await ref.read(authProvider.notifier).refresh();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppStrings.of(context).requestSubmitted)),
      );
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = describeApiError(e, AppStrings.of(context)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    final p = context.palette;

    return Scaffold(
      appBar: AppBar(title: Text(s.newRequest)),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
          children: [
            TextFormField(
              controller: _title,
              enabled: !_busy,
              textInputAction: TextInputAction.done,
              maxLength: 120,
              decoration: InputDecoration(
                labelText: s.requestTitle,
                prefixIcon: const Icon(Icons.title_rounded, size: 20),
              ),
              validator: (v) =>
                  (v ?? '').trim().isEmpty ? s.requestTitle : null,
            ),
            const SizedBox(height: 6),
            Text(s.category, style: TextStyle(fontSize: 13.5, color: p.ink2, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final c in _categories)
                  ChoiceChip(
                    selected: _category == c,
                    onSelected: _busy ? null : (_) => setState(() => _category = c),
                    label: Text(_categoryLabel(c, s)),
                    labelStyle: TextStyle(
                      fontSize: 12.5,
                      fontWeight: _category == c ? FontWeight.w700 : FontWeight.w500,
                      color: _category == c ? p.brand : p.ink2,
                    ),
                    selectedColor: p.brandSoft,
                    backgroundColor: p.surface,
                    side: BorderSide(color: _category == c ? p.brand.withValues(alpha: 0.35) : p.line),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
                    showCheckmark: false,
                  ),
              ],
            ),
            const SizedBox(height: 18),
            Text(s.priority, style: TextStyle(fontSize: 13.5, color: p.ink2, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final pr in _priorities)
                  ChoiceChip(
                    selected: _priority == pr,
                    onSelected: _busy ? null : (_) => setState(() => _priority = pr),
                    label: Text(_priorityLabel(pr, s)),
                    labelStyle: TextStyle(
                      fontSize: 12.5,
                      fontWeight: _priority == pr ? FontWeight.w700 : FontWeight.w500,
                      color: _priority == pr ? p.brand : p.ink2,
                    ),
                    selectedColor: p.brandSoft,
                    backgroundColor: p.surface,
                    side: BorderSide(color: _priority == pr ? p.brand.withValues(alpha: 0.35) : p.line),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
                    showCheckmark: false,
                  ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: p.badSoft, borderRadius: BorderRadius.circular(10)),
                child: Row(
                  children: [
                    Icon(Icons.error_outline_rounded, size: 19, color: p.bad),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(_error!, style: TextStyle(fontSize: 13.5, color: p.bad, height: 1.5)),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _busy ? null : _submit,
              icon: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.send_rounded, size: 19),
              label: Text(s.submitRequest),
            ),
          ],
        ),
      ),
    );
  }

  String _categoryLabel(String c, AppStrings s) => switch (c) {
        'plumbing' => s.catPlumbing,
        'electrical' => s.catElectrical,
        'ac' => s.catAc,
        'elevator' => s.catElevator,
        'cleaning' => s.catCleaning,
        _ => s.catOther,
      };

  String _priorityLabel(String pr, AppStrings s) => switch (pr) {
        'low' => s.priorityLow,
        'high' => s.priorityHigh,
        _ => s.priorityNormal,
      };
}
