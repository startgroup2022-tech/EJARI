import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/localization/app_strings.dart';
import '../../core/network/error_messages.dart';
import '../../core/theme/ejari_palette.dart';
import '../../providers/core_providers.dart';
import '../../widgets/ejari_logo.dart';

/// Sets a new password using a reset token issued by the backend.
///
/// The token is validated first (`GET /api/auth/reset-password/:token`), then
/// consumed once via `POST /api/auth/reset-password`. It is only held in memory
/// for the lifetime of this screen and is never persisted.
class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key, required this.token});

  final String token;

  @override
  ConsumerState<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

enum _Stage { verifying, form, invalid, expired, done }

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  _Stage _stage = _Stage.verifying;
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _verify();
  }

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    try {
      final result = await ref.read(ejariApiProvider).checkResetToken(widget.token);
      if (!mounted) return;
      setState(() => _stage = switch (result) {
            'valid' => _Stage.form,
            'expired' => _Stage.expired,
            _ => _Stage.invalid,
          });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _stage = _Stage.invalid;
        _error = describeApiError(e, AppStrings.of(context));
      });
    }
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(ejariApiProvider).resetPassword(
            token: widget.token,
            password: _password.text,
          );
      if (!mounted) return;
      // Drop the token and the typed password from memory as soon as it is used.
      _password.clear();
      _confirm.clear();
      setState(() => _stage = _Stage.done);
    } on ApiException catch (e) {
      if (!mounted) return;
      // An expired/invalid token discovered at submit time is a terminal state.
      final s = AppStrings.of(context);
      if (e.serverCode == 'expired_token') {
        setState(() => _stage = _Stage.expired);
      } else if (e.serverCode == 'invalid_token') {
        setState(() => _stage = _Stage.invalid);
      } else {
        setState(() => _error = describeApiError(e, s));
      }
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
      appBar: AppBar(title: Text(s.resetPasswordTitle)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: switch (_stage) {
                _Stage.verifying => _centered(
                    const SizedBox(
                      width: 30,
                      height: 30,
                      child: CircularProgressIndicator(strokeWidth: 2.6),
                    ),
                    s.verifyingLink,
                    p,
                  ),
                _Stage.invalid => _messageView(
                    s.resetInvalidLink,
                    Icons.link_off_rounded,
                    p,
                    isDark,
                  ),
                _Stage.expired => _messageView(
                    s.resetExpiredLink,
                    Icons.timer_off_outlined,
                    p,
                    isDark,
                  ),
                _Stage.done => _messageView(
                    s.resetSuccess,
                    Icons.check_circle_outline_rounded,
                    p,
                    isDark,
                    success: true,
                  ),
                _Stage.form => _formView(s, p, isDark),
              },
            ),
          ),
        ),
      ),
    );
  }

  Widget _centered(Widget child, String label, EjariPalette p) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 60),
          child,
          const SizedBox(height: 14),
          Text(label, style: TextStyle(fontSize: 14, color: p.ink2)),
        ],
      );

  Widget _messageView(String message, IconData icon, EjariPalette p, bool isDark,
      {bool success = false}) {
    final s = AppStrings.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        Center(child: EjariLogo(height: 58, onDarkBackground: isDark)),
        const SizedBox(height: 22),
        Container(
          width: 58,
          height: 58,
          decoration: BoxDecoration(
            color: success ? p.okSoft : p.badSoft,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: success ? p.ok : p.bad, size: 28),
        ),
        const SizedBox(height: 18),
        Text(
          message,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 15.5, color: p.ink, height: 1.6),
        ),
        const SizedBox(height: 26),
        FilledButton(
          onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
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
            s.resetPasswordTitle,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 23, fontWeight: FontWeight.w700, color: p.ink),
          ),
          const SizedBox(height: 8),
          Text(
            s.resetPasswordIntro,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14.5, color: p.ink2, height: 1.6),
          ),
          const SizedBox(height: 26),
          TextFormField(
            controller: _password,
            obscureText: _obscure,
            enabled: !_busy,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: s.newPassword,
              prefixIcon: const Icon(Icons.lock_reset_rounded, size: 20),
              suffixIcon: IconButton(
                onPressed: () => setState(() => _obscure = !_obscure),
                icon: Icon(
                  _obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                  size: 20,
                ),
                tooltip: s.password,
              ),
            ),
            validator: (v) => (v ?? '').length < 8 ? s.passwordTooShort : null,
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _confirm,
            obscureText: _obscure,
            enabled: !_busy,
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _busy ? null : _submit(),
            decoration: InputDecoration(
              labelText: s.confirmPassword,
              prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
            ),
            validator: (v) => (v ?? '') != _password.text ? s.passwordMismatch : null,
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
                : Text(s.save),
          ),
        ],
      ),
    );
  }
}
