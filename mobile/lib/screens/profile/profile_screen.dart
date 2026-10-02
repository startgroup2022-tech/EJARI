import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/localization/app_strings.dart';
import '../../core/localization/domain_labels.dart';
import '../../core/localization/formatters.dart';
import '../../core/network/error_messages.dart';
import '../../core/theme/ejari_palette.dart';
import '../../providers/auth_provider.dart';
import '../../providers/core_providers.dart';
import '../../widgets/section_card.dart';
import '../../widgets/state_views.dart';
import '../../widgets/status_chip.dart';

/// Account details, language, appearance, password change and sign-out.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    if (auth is! AuthSignedIn) return const LoadingView();

    final s = AppStrings.of(context);
    final p = context.palette;
    final lang = Localizations.localeOf(context).languageCode;
    final user = auth.user;
    final locale = ref.watch(localeProvider);
    final themeMode = ref.watch(themeModeProvider);

    return Scaffold(
      appBar: AppBar(title: Text(s.profile)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          SectionCard(
            child: Row(
              children: [
                Container(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(color: p.brandSoft, shape: BoxShape.circle),
                  child: Center(
                    child: Text(
                      _initials(user.name.forLang(lang)),
                      style: TextStyle(fontSize: 21, fontWeight: FontWeight.w700, color: p.brand),
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
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: p.ink),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          StatusChip(
                            label: DomainLabels.roleLabel(user.role.name, s),
                            tone: Tone.brand,
                          ),
                          const SizedBox(width: 7),
                          StatusChip(
                            label: user.verified ? s.verified : s.unverified,
                            tone: user.verified ? Tone.success : Tone.warn,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(s.accountInfo, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: p.ink)),
          const SizedBox(height: 10),
          SectionCard(
            child: Column(
              children: [
                _Row(label: s.fullName, value: user.name.forLang(lang)),
                _Row(label: s.email, value: user.email),
                _Row(label: s.phone, value: user.phone ?? '—'),
                _Row(label: s.cpr, value: user.cpr ?? '—'),
                _Row(label: s.memberSince, value: Fmt.date(user.joined, lang)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(s.appearance, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: p.ink)),
          const SizedBox(height: 10),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.language, style: TextStyle(fontSize: 13, color: p.ink2)),
                const SizedBox(height: 9),
                Wrap(
                  spacing: 8,
                  children: [
                    _Choice(
                      label: s.arabic,
                      selected: (locale?.languageCode ?? lang) == 'ar',
                      onTap: () => ref.read(localeProvider.notifier).set(const Locale('ar')),
                    ),
                    _Choice(
                      label: s.english,
                      selected: (locale?.languageCode ?? lang) == 'en',
                      onTap: () => ref.read(localeProvider.notifier).set(const Locale('en')),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Text(s.appearance, style: TextStyle(fontSize: 13, color: p.ink2)),
                const SizedBox(height: 9),
                Wrap(
                  spacing: 8,
                  children: [
                    _Choice(
                      label: s.themeSystem,
                      selected: themeMode == ThemeMode.system,
                      onTap: () => ref.read(themeModeProvider.notifier).set(ThemeMode.system),
                    ),
                    _Choice(
                      label: s.themeLight,
                      selected: themeMode == ThemeMode.light,
                      onTap: () => ref.read(themeModeProvider.notifier).set(ThemeMode.light),
                    ),
                    _Choice(
                      label: s.themeDark,
                      selected: themeMode == ThemeMode.dark,
                      onTap: () => ref.read(themeModeProvider.notifier).set(ThemeMode.dark),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SectionCard(
            padding: EdgeInsets.zero,
            child: ListTile(
              leading: Icon(Icons.lock_outline_rounded, color: p.ink2),
              title: Text(
                s.changePassword,
                style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500, color: p.ink),
              ),
              trailing: Icon(Icons.chevron_left_rounded, size: 20, color: p.ink3),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ChangePasswordScreen()),
              ),
            ),
          ),
          const SizedBox(height: 22),
          OutlinedButton.icon(
            onPressed: () => _confirmSignOut(context, ref),
            icon: const Icon(Icons.logout_rounded, size: 19),
            label: Text(s.logout),
            style: OutlinedButton.styleFrom(
              foregroundColor: p.bad,
              side: BorderSide(color: p.bad.withValues(alpha: 0.4)),
            ),
          ),
          const SizedBox(height: 14),
          Center(
            child: Text(
              '${s.appName} · ${s.version} 1.0.0',
              style: TextStyle(fontSize: 12, color: p.ink3),
            ),
          ),
        ],
      ),
    );
  }

  static Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final s = AppStrings.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(s.logoutConfirmTitle),
        content: Text(s.logoutConfirmBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.cancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s.logout)),
        ],
      ),
    );
    if (ok != true) return;
    await ref.read(authProvider.notifier).signOut();
    if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst);
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((x) => x.isNotEmpty).toList();
    if (parts.isEmpty) return '؟';
    if (parts.length == 1) return parts.first.characters.first;
    return '${parts.first.characters.first}${parts.last.characters.first}';
  }
}

class _Choice extends StatelessWidget {
  const _Choice({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return ChoiceChip(
      selected: selected,
      onSelected: (_) => onTap(),
      label: Text(label),
      labelStyle: TextStyle(
        fontSize: 12.5,
        fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
        color: selected ? p.brand : p.ink2,
      ),
      selectedColor: p.brandSoft,
      backgroundColor: p.surface,
      side: BorderSide(color: selected ? p.brand.withValues(alpha: 0.35) : p.line),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
      showCheckmark: false,
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 13.5, color: p.ink2)),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: p.ink),
            ),
          ),
        ],
      ),
    );
  }
}

/// Changes the password through the real `POST /api/auth/password` endpoint.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
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
      await ref.read(ejariApiProvider).changePassword(
            currentPassword: _current.text,
            newPassword: _next.text,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppStrings.of(context).passwordChanged)),
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
      appBar: AppBar(title: Text(s.changePassword)),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
          children: [
            TextFormField(
              controller: _current,
              obscureText: true,
              enabled: !_busy,
              decoration: InputDecoration(
                labelText: s.currentPassword,
                prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
              ),
              validator: (v) => (v ?? '').isEmpty ? s.passwordRequired : null,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _next,
              obscureText: true,
              enabled: !_busy,
              decoration: InputDecoration(
                labelText: s.newPassword,
                prefixIcon: const Icon(Icons.lock_reset_rounded, size: 20),
              ),
              validator: (v) =>
                  (v ?? '').length < 8 ? s.passwordTooShort : null,
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
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
            const SizedBox(height: 22),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
                    )
                  : Text(s.save),
            ),
          ],
        ),
      ),
    );
  }
}
