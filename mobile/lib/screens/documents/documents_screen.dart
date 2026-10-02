import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/errors/api_exception.dart';
import '../../core/localization/app_strings.dart';
import '../../core/localization/formatters.dart';
import '../../core/network/error_messages.dart';
import '../../core/theme/ejari_palette.dart';
import '../../models/document.dart';
import '../../providers/auth_provider.dart';
import '../../providers/core_providers.dart';
import '../../widgets/state_views.dart';
import '../../widgets/status_chip.dart';

/// Documents the user owns, with real downloads of stored files.
///
/// Documents that hold only metadata (no `dataUrl`) are shown as unavailable
/// rather than offering a download that would 404.
class DocumentsScreen extends ConsumerStatefulWidget {
  const DocumentsScreen({super.key});

  @override
  ConsumerState<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends ConsumerState<DocumentsScreen> {
  String? _busyId;

  Future<void> _download(AppDocument doc) async {
    final s = AppStrings.of(context);
    if (!doc.hasFile) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.docNoFile)));
      return;
    }
    setState(() => _busyId = doc.id);
    try {
      final bytes = await ref.read(ejariApiProvider).downloadDocument(doc.id);
      final dir = await getTemporaryDirectory();
      final safeName = doc.name.replaceAll(RegExp(r'[^\w.\-]'), '_');
      final file = File('${dir.path}/$safeName');
      await file.writeAsBytes(bytes);
      await OpenFilex.open(file.path);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(describeApiError(e, AppStrings.of(context)))));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.docDownloadFailed)));
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const LoadingView();

    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;
    final docs = auth.bootstrap.documents;

    return Scaffold(
      appBar: AppBar(title: Text(s.documents)),
      body: RefreshIndicator(
        onRefresh: () => ref.read(authProvider.notifier).refresh(),
        child: docs.isEmpty
            ? ListView(
                children: [
                  SizedBox(height: MediaQuery.sizeOf(context).height * 0.2),
                  EmptyView(icon: Icons.folder_outlined, message: s.noDocuments),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                itemCount: docs.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  final doc = docs[i];
                  final busy = _busyId == doc.id;
                  return Material(
                    color: p.surface,
                    borderRadius: BorderRadius.circular(14),
                    child: InkWell(
                      onTap: busy ? null : () => _download(doc),
                      borderRadius: BorderRadius.circular(14),
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: p.line),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                color: p.surfaceAlt,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(_iconFor(doc.type), size: 21, color: p.ink2),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    doc.name,
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                      color: p.ink,
                                    ),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const SizedBox(height: 5),
                                  Wrap(
                                    spacing: 8,
                                    runSpacing: 6,
                                    children: [
                                      StatusChip(label: doc.type, tone: Tone.info),
                                      if (doc.date != null)
                                        StatusChip(
                                          label: Fmt.date(doc.date, lang),
                                          tone: Tone.neutral,
                                          icon: Icons.event_outlined,
                                        ),
                                      if (!doc.hasFile)
                                        StatusChip(
                                          label: s.notAvailable,
                                          tone: Tone.warn,
                                          icon: Icons.link_off_rounded,
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            busy
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(strokeWidth: 2.2),
                                  )
                                : Icon(
                                    doc.hasFile
                                        ? Icons.download_rounded
                                        : Icons.remove_circle_outline_rounded,
                                    color: doc.hasFile ? p.brand : p.ink3,
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

  IconData _iconFor(String type) => switch (type) {
        'receipt' => Icons.receipt_long_outlined,
        'contract' => Icons.description_outlined,
        'id' => Icons.badge_outlined,
        'deed' => Icons.home_work_outlined,
        _ => Icons.insert_drive_file_outlined,
      };
}
