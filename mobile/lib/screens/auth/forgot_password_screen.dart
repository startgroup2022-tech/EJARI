import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/localization/app_strings.dart';
import '../../core/network/error_messages.dart';
import '../../core/theme/ejari_palette.dart';
import '../../providers/core_providers.dart';
import '../../widgets/ejari_logo.dart';

/// Requests a password-reset link through the real `POST /api/auth/forgot-password`.
///
/// The backend never reveals whether an email is registered, so this screen shows
/// the same confirmation for every valid submission and never inspects the response.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();

  bool _busy = false;
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
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
      await ref.read(ejariApiProvider).forgotPassword(_email.text.trim());
      if (!mounted) return;
      setState(() => _sent = true);
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
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(title: Text(s.forgotPasswordTitle)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: _sent ? _sentView(s, p, isDark) : _formView(s, p, isDark),
            ),
          ),
        ),
      ),
    );
  }

  Widget _sentView(AppStrings s, EjariPalette p, bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        Center(child: EjariLogo(height: 58, onDarkBackground: isDark)),
        const SizedBox(height: 22),
        Container(
          width: 58,
          height: 58,
          decoration: BoxDecoration(color: p.brandSoft, shape: BoxShape.circle),
          child: Icon(Icons.mark_email_read_outlined, color: p.brand, size: 28),
        ),
        const SizedBox(height: 18),
        Text(
          s.resetLinkSentTitle,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: p.ink),
        ),
        const SizedBox(height: 10),
        Text(
          s.resetLinkSentBody,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 14.5, color: p.ink2, height: 1.6),
        ),
        const SizedBox(height: 26),
        FilledButton(
          onPressed: () => Navigator.of(context).maybePop(),
          child: Text(s.backToLogin),
        ),
      ],
    );
  }

  Widget _formView(AppStrings s, EjariPalette p, bool isDark) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),
          Center(child: EjariLogo(height: 58, onDarkBackground: isDark)),
          const SizedBox(height: 22),
          Text(
            s.forgotPasswordTitle,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 23, fontWeight: FontWeight.w700, color: p.ink),
          ),
          const SizedBox(height: 8),
          Text(
            s.forgotPasswordIntro,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14.5, color: p.ink2, height: 1.6),
          ),
          const SizedBox(height: 26),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.email],
            enabled: !_busy,
            onFieldSubmitted: (_) => _busy ? null : _submit(),
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
          if (_error != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: p.badSoft, borderRadius: BorderRadius.circular(10)),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
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
                : Text(s.sendResetLink),
          ),
          const SizedBox(height: 10),
          TextButton(
            onPressed: _busy ? null : () => Navigator.of(context).maybePop(),
            child: Text(s.backToLogin),
          ),
        ],
      ),
    );
  }
}
