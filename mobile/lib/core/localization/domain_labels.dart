import 'package:flutter/material.dart';

import '../theme/ejari_palette.dart';
import 'app_strings.dart';

/// Maps the backend's stable status codes onto localised labels and tones.
///
/// These codes are the contract with `server/api.mjs`; keeping the mapping in one
/// place stops status text from drifting between screens.
class DomainLabels {
  DomainLabels._();

  // ---- Contracts ----
  static (String, Tone) contract(String status, AppStrings s) => switch (status) {
        'active' => (s.statusDone, Tone.success),
        'expiring' => (s.upcoming, Tone.warn),
        'pending_sign' => (s.signedByLandlord, Tone.info),
        'pending_pay' => (s.due, Tone.warn),
        'under_review' => (s.details, Tone.info),
        'disputed' => (s.overdue, Tone.danger),
        'expired' => (s.statusDone, Tone.neutral),
        'terminated' => (s.close, Tone.danger),
        _ => (status, Tone.neutral),
      };

  // ---- Payments ----
  static (String, Tone) payment(String status, AppStrings s) => switch (status) {
        'paid' => (s.paid, Tone.success),
        'due' => (s.due, Tone.info),
        'overdue' => (s.overdue, Tone.danger),
        'upcoming' => (s.upcoming, Tone.neutral),
        _ => (status, Tone.neutral),
      };

  static String paymentMethod(String? method, AppStrings s) => switch (method) {
        'benefit' => s.methodBenefit,
        'card' => s.methodCard,
        'transfer' => s.methodTransfer,
        'cash' => s.methodCash,
        _ => s.notAvailable,
      };

  static String paymentKind(String kind, AppStrings s) => switch (kind) {
        'rent' => s.rent,
        'fee' => s.feePayment,
        'deposit' => s.deposit,
        _ => kind,
      };

  // ---- Maintenance ----
  static (String, Tone) maintenance(String status, AppStrings s) => switch (status) {
        'new' => (s.statusNew, Tone.info),
        'in_progress' => (s.statusInProgress, Tone.warn),
        'done' => (s.statusDone, Tone.success),
        _ => (status, Tone.neutral),
      };

  static String priority(String priority, AppStrings s) => switch (priority) {
        'low' => s.priorityLow,
        'high' => s.priorityHigh,
        _ => s.priorityNormal,
      };

  static Tone priorityTone(String priority) => switch (priority) {
        'low' => Tone.neutral,
        'high' => Tone.danger,
        _ => Tone.info,
      };

  // ---- Service requests ----
  static (String, Tone) request(String status, AppStrings s) => switch (status) {
        'new' => (s.requestStatusNew, Tone.info),
        'assigned' => (s.requestStatusAssigned, Tone.gold),
        'scheduled' => (s.requestStatusScheduled, Tone.warn),
        'in_progress' => (s.requestStatusInProgress, Tone.warn),
        'completed' => (s.requestStatusCompleted, Tone.success),
        'cancelled' => (s.requestStatusCancelled, Tone.danger),
        _ => (status, Tone.neutral),
      };

  // ---- Notifications ----
  static IconData notificationIcon(String type) => switch (type) {
        'pay' => Icons.payments_outlined,
        'contract' => Icons.description_outlined,
        'maint' => Icons.build_outlined,
        'verif' => Icons.verified_outlined,
        _ => Icons.notifications_outlined,
      };

  // ---- Properties / units ----
  static String propertyType(String type, AppStrings s) => switch (type) {
        'building' => s.property,
        'villa' => s.property,
        'shop' => s.property,
        _ => type,
      };

  static String unitType(String type, AppStrings s) => switch (type) {
        'apt' => s.unit,
        'office' => s.unit,
        _ => type,
      };

  static String frequency(String freq, AppStrings s) => switch (freq) {
        'quarterly' => s.quarterly,
        'yearly' => s.yearly,
        _ => s.monthly,
      };

  static String roleLabel(String role, AppStrings s) => switch (role) {
        'landlord' => s.roleLandlord,
        'admin' => s.roleAdmin,
        _ => s.roleTenant,
      };
}
