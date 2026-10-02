import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/localization/app_strings.dart';
import '../../core/localization/formatters.dart';
import '../../core/network/error_messages.dart';
import '../../core/theme/ejari_palette.dart';
import '../../models/service.dart';
import '../../providers/auth_provider.dart';
import '../../providers/core_providers.dart';
import '../../widgets/section_card.dart';
import '../../widgets/status_chip.dart';

/// A single service, and the real `POST /api/service-requests` action.
class ServiceDetailScreen extends ConsumerStatefulWidget {
  const ServiceDetailScreen({super.key, required this.service});

  final Service service;

  @override
  ConsumerState<ServiceDetailScreen> createState() => _ServiceDetailScreenState();
}

class _ServiceDetailScreenState extends ConsumerState<ServiceDetailScreen> {
  final _notes = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _request() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(ejariApiProvider).createServiceRequest(
            serviceId: widget.service.id,
            notes: _notes.text.trim(),
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
    final lang = Localizations.localeOf(context).languageCode;
    final service = widget.service;

    return Scaffold(
      appBar: AppBar(title: Text(service.name.forLang(lang))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        service.name.forLang(lang),
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.ink),
                      ),
                    ),
                    StatusChip(
                      label: Fmt.money(service.price, s.currency),
                      tone: Tone.brand,
                      icon: Icons.sell_outlined,
                    ),
                  ],
                ),
                if (service.description.forLang(lang).isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    service.description.forLang(lang),
                    style: TextStyle(fontSize: 13.5, color: p.ink2, height: 1.7),
                  ),
                ],
                if (service.duration > 0) ...[
                  const SizedBox(height: 12),
                  StatusChip(
                    label: '${s.durationLabel}: ${service.duration} ${s.minutes}',
                    tone: Tone.neutral,
                    icon: Icons.schedule_outlined,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _notes,
            enabled: !_busy,
            maxLines: 3,
            maxLength: 300,
            decoration: InputDecoration(
              labelText: s.notes,
              alignLabelWithHint: true,
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 6),
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
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _busy ? null : _request,
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.send_rounded, size: 19),
            label: Text(s.requestService),
          ),
        ],
      ),
    );
  }
}
