import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/localization/app_strings.dart';
import '../../core/network/error_messages.dart';
import '../../core/theme/ejari_palette.dart';
import '../../providers/auth_provider.dart';
import '../../providers/core_providers.dart';
import '../../widgets/ejari_logo.dart';
import 'forgot_password_screen.dart';

/// Email + password sign-in against the real Ejari backend.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.sessionExpiredMessage});

  /// Set when the user was bounced here because the backend rejected the session.
  final String? sessionExpiredMessage;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();

  bool _obscure = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
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
      await ref.read(authProvider.notifier).signIn(
            email: _email.text.trim(),
            password: _password.text,
          );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = describeApiError(e, AppStrings.of(context)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _demo(String role) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).signInDemo(role);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = describeApiError(e, AppStrings.of(context)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toggleLanguage() {
    final current = ref.read(localeProvider) ?? Localizations.localeOf(context);
    final next = current.languageCode == 'ar' ? const Locale('en') : const Locale('ar');
    ref.read(localeProvider.notifier).set(next);
  }

  void _openForgotPassword() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const ForgotPasswordScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.of(context);
    final p = context.palette;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final width = MediaQuery.sizeOf(context).width;
    final isWide = width >= 700;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: AlignmentDirectional.centerEnd,
                      child: TextButton.icon(
                        onPressed: _busy ? null : _toggleLanguage,
                        icon: const Icon(Icons.translate_rounded, size: 18),
                        label: Text(Localizations.localeOf(context).languageCode == 'ar' ? 'English' : 'العربية'),
                      ),
                    ),
                    SizedBox(height: isWide ? 12 : 0),
                    Center(child: EjariLogo(height: 62, onDarkBackground: isDark)),
                    const SizedBox(height: 22),
                    Text(
                      s.loginTitle,
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: p.ink),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      s.loginSubtitle,
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 14.5, color: p.ink2, height: 1.6),
                    ),
                    const SizedBox(height: 28),

                    if (widget.sessionExpiredMessage != null) ...[
                      _Banner(
                        icon: Icons.lock_clock_outlined,
                        tone: Tone.warn,
                        text: widget.sessionExpiredMessage!,
                      ),
                      const SizedBox(height: 16),
                    ],

                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.email],
                      enabled: !_busy,
                      decoration: InputDecoration(
                        labelText: s.email,
                        prefixIcon: const Icon(Icons.mail_outline_rounded, size: 20),
                      ),
                      validator: (v) {
                        final value = (v ?? '').trim();
                        if (value.isEmpty) return s.emailRequired;
                        if (!value.contains('@') || !value.contains('.')) return s.emailInvalid;
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _password,
                      obscureText: _obscure,
                      enabled: !_busy,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) => _busy ? null : _submit(),
                      decoration: InputDecoration(
                        labelText: s.password,
                        prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
                        suffixIcon: IconButton(
                          onPressed: () => setState(() => _obscure = !_obscure),
                          icon: Icon(
                            _obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                            size: 20,
                          ),
                          tooltip: s.password,
                        ),
                      ),
                      validator: (v) {
                        final value = v ?? '';
                        if (value.isEmpty) return s.passwordRequired;
                        if (value.length < 8) return s.passwordTooShort;
                        return null;
                      },
                    ),

                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      _Banner(icon: Icons.error_outline_rounded, tone: Tone.danger, text: _error!),
                    ],

                    const SizedBox(height: 6),
                    Align(
                      alignment: AlignmentDirectional.centerEnd,
                      child: TextButton(
                        onPressed: _busy ? null : _openForgotPassword,
                        child: Text(s.forgotPassword),
                      ),
                    ),

                    const SizedBox(height: 6),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
                            )
                          : Text(s.login),
                    ),

                    if (ref.watch(demoModeProvider).valueOrNull ?? false) ...[
                      const SizedBox(height: 26),
                      Row(
                        children: [
                          Expanded(child: Divider(color: p.line)),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Text(s.demoAccess, style: TextStyle(fontSize: 12.5, color: p.ink3)),
                          ),
                          Expanded(child: Divider(color: p.line)),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        s.demoAccessHint,
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12.5, color: p.ink3),
                      ),
                      const SizedBox(height: 14),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        alignment: WrapAlignment.center,
                        children: [
                          OutlinedButton(
                            onPressed: _busy ? null : () => _demo('tenant'),
                            child: Text(s.continueAsTenant),
                          ),
                          OutlinedButton(
                            onPressed: _busy ? null : () => _demo('landlord'),
                            child: Text(s.continueAsLandlord),
                          ),
                          OutlinedButton(
                            onPressed: _busy ? null : () => _demo('admin'),
                            child: Text(s.continueAsAdmin),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.icon, required this.tone, required this.text});

  final IconData icon;
  final Tone tone;
  final String text;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final (fg, bg) = p.tone(tone);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 19, color: fg),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: TextStyle(fontSize: 13.5, color: fg, height: 1.5)),
          ),
        ],
      ),
    );
  }
}
