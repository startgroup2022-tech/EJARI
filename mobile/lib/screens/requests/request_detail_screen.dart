import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/localization/app_strings.dart';
import '../../core/localization/domain_labels.dart';
import '../../core/localization/formatters.dart';
import '../../core/network/error_messages.dart';
import '../../core/theme/ejari_palette.dart';
import '../../models/service.dart';
import '../../providers/auth_provider.dart';
import '../../providers/core_providers.dart';
import '../../widgets/section_card.dart';
import '../../widgets/status_chip.dart';

/// A service request with its event timeline, and the ability to post a message
/// through `POST /api/service-requests/:id/message`.
class RequestDetailScreen extends ConsumerStatefulWidget {
  const RequestDetailScreen({super.key, required this.request});

  final ServiceRequest request;

  @override
  ConsumerState<RequestDetailScreen> createState() => _RequestDetailScreenState();
}

class _RequestDetailScreenState extends ConsumerState<RequestDetailScreen> {
  final _message = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _message.text.trim();
    if (text.isEmpty) return;
    setState(() => _busy = true);
    try {
      await ref.read(ejariApiProvider).messageServiceRequest(widget.request.id, text);
      await ref.read(authProvider.notifier).refresh();
      _message.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppStrings.of(context).save)),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(describeApiError(e, AppStrings.of(context)))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;

    final request = auth is AuthSignedIn
        ? (auth.bootstrap.requests
                .where((r) => r.id == widget.request.id)
                .firstOrNull ??
            widget.request)
        : widget.request;
    final service = auth is AuthSignedIn ? auth.bootstrap.serviceById(request.serviceId) : null;
    final (statusLabel, statusTone) = DomainLabels.request(request.status, s);

    return Scaffold(
      appBar: AppBar(title: Text(request.no)),
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
                        service?.name.forLang(lang) ?? s.serviceRequest,
                        style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700, color: p.ink),
                      ),
                    ),
                    StatusChip(label: statusLabel, tone: statusTone),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    StatusChip(
                      label: Fmt.money(request.amount, s.currency),
                      tone: Tone.brand,
                      icon: Icons.sell_outlined,
                    ),
                    StatusChip(
                      label: Fmt.dateTime(request.created, lang),
                      tone: Tone.neutral,
                      icon: Icons.event_outlined,
                    ),
                  ],
                ),
                if (request.notes.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Text(s.notes, style: TextStyle(fontSize: 13, color: p.ink2)),
                  const SizedBox(height: 5),
                  Text(
                    request.notes,
                    style: TextStyle(fontSize: 13.5, color: p.ink, height: 1.6),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(s.timeline, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: p.ink)),
          const SizedBox(height: 10),
          if (request.events.isEmpty)
            SectionCard(
              child: Row(
                children: [
                  Icon(Icons.timeline_rounded, size: 20, color: p.ink3),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(s.requestCreated, style: TextStyle(fontSize: 13.5, color: p.ink2)),
                  ),
                ],
              ),
            )
          else
            for (final event in request.events) ...[
              SectionCard(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      margin: const EdgeInsets.only(top: 5),
                      decoration: BoxDecoration(color: p.brand, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            event.note.isNotEmpty ? event.note : event.kind,
                            style: TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w600,
                              color: p.ink,
                              height: 1.5,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            Fmt.dateTime(event.at, lang),
                            style: TextStyle(fontSize: 11.5, color: p.ink3),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
            ],
          const SizedBox(height: 8),
          TextField(
            controller: _message,
            enabled: !_busy,
            maxLines: 2,
            decoration: InputDecoration(
              labelText: s.notes,
              alignLabelWithHint: true,
              suffixIcon: IconButton(
                onPressed: _busy ? null : _send,
                icon: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send_rounded),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
